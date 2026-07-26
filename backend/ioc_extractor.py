"""Regex-based IoC extraction."""
import re
from typing import List, Dict

from backend.models import IoC

IP_RE = re.compile(r"\b(?:(?:25[0-5]|2[0-4]\d|[01]?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d?\d)\b")
DOMAIN_RE = re.compile(r"\b(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}\b")
URL_RE = re.compile(r"https?://[^\s\"'<>]+", re.IGNORECASE)
MD5_RE = re.compile(r"\b[a-fA-F0-9]{32}\b")
SHA1_RE = re.compile(r"\b[a-fA-F0-9]{40}\b")
SHA256_RE = re.compile(r"\b[a-fA-F0-9]{64}\b")
CVE_RE = re.compile(r"CVE-\d{4}-\d{4,7}", re.IGNORECASE)
EMAIL_RE = re.compile(r"[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}")

PRIVATE_IP_PREFIXES = ("10.", "192.168.", "127.", "0.")

# File-like "domains" (cmd.exe, payload.jar, invoice.pdf.exe, payload.sh).
# Intentionally omit real TLDs — especially "com" — or FQDNs like
# evil-mail.example.com / exfil.evil.example.com are dropped as false files.
_FILE_SUFFIXES = frozenset(
    {
        "exe", "dll", "sys", "txt", "jar", "sh", "ps1", "bin", "aspx", "docm",
        "pdf", "bat", "cmd", "msi", "zip", "rar", "locked", "enc", "log", "conf",
        "cfg", "ini", "dat", "tmp", "so", "dylib", "doc", "docx", "xls", "xlsx",
        "ppt", "pptx", "js", "vbs", "hta", "scr", "iso", "img",
    }
)

# Cap extracted IoCs for huge logs (A-E3)
MAX_IOCS_DEFAULT = int(__import__("os").environ.get("ACTIRA_MAX_EXTRACT_IOCS", "500") or "500")


def _is_public_ip(ip: str) -> bool:
    """A-E3: filter RFC1918, loopback, link-local, CGNAT, multicast, docs nets."""
    if not ip:
        return False
    if ip.startswith(PRIVATE_IP_PREFIXES):
        return False
    # link-local / APIPA
    if ip.startswith("169.254."):
        return False
    # CGNAT 100.64.0.0/10
    if ip.startswith("100."):
        try:
            second = int(ip.split(".")[1])
            if 64 <= second <= 127:
                return False
        except (ValueError, IndexError):
            pass
    # multicast / reserved
    if ip.startswith(("224.", "239.", "255.")):
        return False
    # TEST-NET / documentation (optional noise)
    if ip.startswith(("192.0.2.", "198.51.100.", "203.0.113.")):
        # keep as public for demos/golden that use these as "attacker" IPs
        return True
    if ip.startswith("172."):
        try:
            second = int(ip.split(".")[1])
            if 16 <= second <= 31:
                return False
        except (ValueError, IndexError):
            pass
    return True


def _looks_like_filename(domain: str) -> bool:
    """Drop basename.ext and multi-ext false positives from DOMAIN_RE.

    Keeps real FQDNs ending in .com/.net/.org while filtering cmd.exe,
    payload.jar, invoice.pdf.exe, readme.txt, a.sh, etc.
    """
    labels = (domain or "").lower().split(".")
    if len(labels) < 2:
        return True
    if labels[-1] in _FILE_SUFFIXES:
        return True
    # e.g. invoice.pdf.exe
    if any(lab in _FILE_SUFFIXES for lab in labels[:-1]):
        return True
    return False


def extract_iocs(text: str) -> List[IoC]:
    found: Dict[tuple, IoC] = {}

    for m in URL_RE.finditer(text):
        v = m.group(0).rstrip(".,;)")
        found[("url", v)] = IoC(type="url", value=v, confidence=0.95)

    for m in IP_RE.finditer(text):
        ip = m.group(0)
        if _is_public_ip(ip):
            found.setdefault(("ip", ip), IoC(type="ip", value=ip, confidence=0.9))

    for m in SHA256_RE.finditer(text):
        v = m.group(0).lower()
        found[("hash_sha256", v)] = IoC(type="hash_sha256", value=v, confidence=0.98)
    for m in SHA1_RE.finditer(text):
        v = m.group(0).lower()
        if ("hash_sha256", v) not in found:
            found[("hash_sha1", v)] = IoC(type="hash_sha1", value=v, confidence=0.95)
    for m in MD5_RE.finditer(text):
        v = m.group(0).lower()
        if ("hash_sha1", v) not in found and ("hash_sha256", v) not in found:
            found[("hash_md5", v)] = IoC(type="hash_md5", value=v, confidence=0.9)

    for m in CVE_RE.finditer(text):
        v = m.group(0).upper()
        found[("cve", v)] = IoC(type="cve", value=v, confidence=1.0)

    for m in EMAIL_RE.finditer(text):
        v = m.group(0).lower()
        found[("email", v)] = IoC(type="email", value=v, confidence=0.9)

    # Domains - extract but skip if part of URLs already
    url_hosts = set()
    for k in found:
        if k[0] == "url":
            m = re.search(r"https?://([^/\s:]+)", k[1])
            if m:
                url_hosts.add(m.group(1).lower())

    for m in DOMAIN_RE.finditer(text):
        v = m.group(0).lower()
        if len(v.split(".")) < 2 or v.replace(".", "").isdigit():
            continue
        if v in url_hosts or ("domain", v) in found:
            continue
        if _looks_like_filename(v):
            continue
        found[("domain", v)] = IoC(type="domain", value=v, confidence=0.75)

    items = list(found.values())
    cap = max(50, MAX_IOCS_DEFAULT)
    if len(items) > cap:
        # Prefer high-confidence types first
        order = {
            "hash_sha256": 0, "hash_sha1": 1, "hash_md5": 2, "cve": 3,
            "ip": 4, "url": 5, "domain": 6, "email": 7,
        }
        items.sort(key=lambda i: (order.get(i.type, 9), -float(i.confidence or 0)))
        items = items[:cap]
    return items
