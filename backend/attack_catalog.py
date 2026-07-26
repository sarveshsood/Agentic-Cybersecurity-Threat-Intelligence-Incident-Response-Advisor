"""Curated MITRE ATT&CK Enterprise catalog for ACTIRA drill-down.

Not a full STIX import — a focused subset covering techniques we detect plus
common sub-techniques, mitigations, data sources, and external URLs.
Extend by adding entries to ATTACK_CATALOG; allow-list for LLM validation is
derived from catalog keys.
"""
from __future__ import annotations

from typing import Any, Dict, List, Optional, Set

# Parent + sub-technique catalog
# id → metadata
ATTACK_CATALOG: Dict[str, Dict[str, Any]] = {
    # ----- Credential Access -----
    "T1110": {
        "name": "Brute Force",
        "tactic": "Credential Access",
        "platforms": ["Windows", "Linux", "macOS", "Azure AD", "Office 365", "SaaS"],
        "data_sources": ["User Account Authentication", "Application Log"],
        "mitigations": [
            {"id": "M1036", "name": "Account Use Policies"},
            {"id": "M1032", "name": "Multi-factor Authentication"},
            {"id": "M1027", "name": "Password Policies"},
        ],
        "description": "Adversaries may use brute force techniques to gain access when passwords are unknown or obtained.",
        "url": "https://attack.mitre.org/techniques/T1110/",
        "parent_id": None,
    },
    "T1110.001": {
        "name": "Password Guessing",
        "tactic": "Credential Access",
        "platforms": ["Windows", "Linux", "macOS", "Azure AD", "Office 365", "SaaS"],
        "data_sources": ["User Account Authentication"],
        "mitigations": [
            {"id": "M1036", "name": "Account Use Policies"},
            {"id": "M1032", "name": "Multi-factor Authentication"},
        ],
        "description": "Adversaries may use a single or small list of commonly used passwords against many different accounts.",
        "url": "https://attack.mitre.org/techniques/T1110/001/",
        "parent_id": "T1110",
    },
    "T1110.002": {
        "name": "Password Cracking",
        "tactic": "Credential Access",
        "platforms": ["Windows", "Linux", "macOS"],
        "data_sources": ["Command", "Process"],
        "mitigations": [{"id": "M1041", "name": "Encrypt Sensitive Information"}],
        "description": "Adversaries may use password cracking to recover credentials from password hashes.",
        "url": "https://attack.mitre.org/techniques/T1110/002/",
        "parent_id": "T1110",
    },
    "T1110.003": {
        "name": "Password Spraying",
        "tactic": "Credential Access",
        "platforms": ["Windows", "Linux", "macOS", "Azure AD", "Office 365", "SaaS"],
        "data_sources": ["User Account Authentication"],
        "mitigations": [
            {"id": "M1036", "name": "Account Use Policies"},
            {"id": "M1032", "name": "Multi-factor Authentication"},
        ],
        "description": "Adversaries may use a single password against many different accounts to avoid lockouts.",
        "url": "https://attack.mitre.org/techniques/T1110/003/",
        "parent_id": "T1110",
    },
    "T1110.004": {
        "name": "Credential Stuffing",
        "tactic": "Credential Access",
        "platforms": ["Windows", "Linux", "macOS", "Azure AD", "Office 365", "SaaS"],
        "data_sources": ["User Account Authentication"],
        "mitigations": [
            {"id": "M1032", "name": "Multi-factor Authentication"},
            {"id": "M1027", "name": "Password Policies"},
        ],
        "description": "Adversaries may use credentials obtained from breach dumps against other systems.",
        "url": "https://attack.mitre.org/techniques/T1110/004/",
        "parent_id": "T1110",
    },
    "T1078": {
        "name": "Valid Accounts",
        "tactic": "Initial Access, Persistence, Privilege Escalation, Defense Evasion",
        "platforms": ["Windows", "Linux", "macOS", "Azure AD", "Office 365", "SaaS", "IaaS"],
        "data_sources": ["Logon Session", "User Account Authentication"],
        "mitigations": [
            {"id": "M1026", "name": "Privileged Account Management"},
            {"id": "M1032", "name": "Multi-factor Authentication"},
        ],
        "description": "Adversaries may obtain and abuse credentials of existing accounts.",
        "url": "https://attack.mitre.org/techniques/T1078/",
        "parent_id": None,
    },
    "T1078.004": {
        "name": "Cloud Accounts",
        "tactic": "Initial Access, Persistence, Privilege Escalation, Defense Evasion",
        "platforms": ["Azure AD", "Office 365", "SaaS", "IaaS"],
        "data_sources": ["User Account Authentication", "Application Log"],
        "mitigations": [{"id": "M1032", "name": "Multi-factor Authentication"}],
        "description": "Adversaries may obtain and abuse credentials of a cloud account.",
        "url": "https://attack.mitre.org/techniques/T1078/004/",
        "parent_id": "T1078",
    },
    # ----- Initial Access -----
    "T1566": {
        "name": "Phishing",
        "tactic": "Initial Access",
        "platforms": ["Windows", "Linux", "macOS", "SaaS", "Office 365"],
        "data_sources": ["Application Log", "Network Traffic", "Email"],
        "mitigations": [
            {"id": "M1049", "name": "Antivirus/Antimalware"},
            {"id": "M1054", "name": "Software Configuration"},
            {"id": "M1017", "name": "User Training"},
        ],
        "description": "Adversaries may send phishing messages to gain access to victim systems.",
        "url": "https://attack.mitre.org/techniques/T1566/",
        "parent_id": None,
    },
    "T1566.001": {
        "name": "Spearphishing Attachment",
        "tactic": "Initial Access",
        "platforms": ["Windows", "Linux", "macOS"],
        "data_sources": ["Email", "File", "Process"],
        "mitigations": [{"id": "M1049", "name": "Antivirus/Antimalware"}, {"id": "M1017", "name": "User Training"}],
        "description": "Adversaries may send spearphishing emails with a malicious attachment.",
        "url": "https://attack.mitre.org/techniques/T1566/001/",
        "parent_id": "T1566",
    },
    "T1566.002": {
        "name": "Spearphishing Link",
        "tactic": "Initial Access",
        "platforms": ["Windows", "Linux", "macOS", "SaaS", "Office 365"],
        "data_sources": ["Email", "Network Traffic", "Application Log"],
        "mitigations": [{"id": "M1017", "name": "User Training"},
                        {"id": "M1021", "name": "Restrict Web-Based Content"}],
        "description": "Adversaries may send spearphishing emails with a malicious link.",
        "url": "https://attack.mitre.org/techniques/T1566/002/",
        "parent_id": "T1566",
    },
    "T1566.003": {
        "name": "Spearphishing via Service",
        "tactic": "Initial Access",
        "platforms": ["Windows", "Linux", "macOS", "SaaS"],
        "data_sources": ["Application Log", "Network Traffic"],
        "mitigations": [{"id": "M1017", "name": "User Training"}],
        "description": "Adversaries may send spearphishing via third-party services (OAuth, social, etc.).",
        "url": "https://attack.mitre.org/techniques/T1566/003/",
        "parent_id": "T1566",
    },
    "T1190": {
        "name": "Exploit Public-Facing Application",
        "tactic": "Initial Access",
        "platforms": ["Windows", "Linux", "macOS", "Network", "Containers"],
        "data_sources": ["Application Log", "Network Traffic"],
        "mitigations": [
            {"id": "M1048", "name": "Application Isolation and Sandboxing"},
            {"id": "M1051", "name": "Update Software"},
        ],
        "description": "Adversaries may attempt to exploit a weakness in an Internet-facing application.",
        "url": "https://attack.mitre.org/techniques/T1190/",
        "parent_id": None,
    },
    # ----- Execution -----
    "T1059": {
        "name": "Command and Scripting Interpreter",
        "tactic": "Execution",
        "platforms": ["Windows", "Linux", "macOS", "Network"],
        "data_sources": ["Command", "Process", "Script"],
        "mitigations": [
            {"id": "M1038", "name": "Execution Prevention"},
            {"id": "M1049", "name": "Antivirus/Antimalware"},
        ],
        "description": "Adversaries may abuse command and script interpreters to execute commands, scripts, or binaries.",
        "url": "https://attack.mitre.org/techniques/T1059/",
        "parent_id": None,
    },
    "T1059.001": {
        "name": "PowerShell",
        "tactic": "Execution",
        "platforms": ["Windows"],
        "data_sources": ["Command", "Process", "Script", "Module"],
        "mitigations": [{"id": "M1045", "name": "Code Signing"}, {"id": "M1038", "name": "Execution Prevention"}],
        "description": "Adversaries may abuse PowerShell to execute commands and scripts.",
        "url": "https://attack.mitre.org/techniques/T1059/001/",
        "parent_id": "T1059",
    },
    "T1059.003": {
        "name": "Windows Command Shell",
        "tactic": "Execution",
        "platforms": ["Windows"],
        "data_sources": ["Command", "Process"],
        "mitigations": [{"id": "M1038", "name": "Execution Prevention"}],
        "description": "Adversaries may abuse the Windows command shell for execution.",
        "url": "https://attack.mitre.org/techniques/T1059/003/",
        "parent_id": "T1059",
    },
    "T1059.004": {
        "name": "Unix Shell",
        "tactic": "Execution",
        "platforms": ["Linux", "macOS"],
        "data_sources": ["Command", "Process"],
        "mitigations": [{"id": "M1038", "name": "Execution Prevention"}],
        "description": "Adversaries may abuse Unix shell commands and scripts for execution.",
        "url": "https://attack.mitre.org/techniques/T1059/004/",
        "parent_id": "T1059",
    },
    "T1059.005": {
        "name": "Visual Basic",
        "tactic": "Execution",
        "platforms": ["Windows", "macOS"],
        "data_sources": ["Command", "Process", "Script"],
        "mitigations": [{"id": "M1040", "name": "Behavior Prevention on Endpoint"}],
        "description": "Adversaries may abuse Visual Basic for execution (VBS, VBA macros).",
        "url": "https://attack.mitre.org/techniques/T1059/005/",
        "parent_id": "T1059",
    },
    "T1059.007": {
        "name": "JavaScript",
        "tactic": "Execution",
        "platforms": ["Windows", "Linux", "macOS"],
        "data_sources": ["Command", "Process", "Script"],
        "mitigations": [{"id": "M1040", "name": "Behavior Prevention on Endpoint"}],
        "description": "Adversaries may abuse JavaScript for execution (wscript, browsers, JScript).",
        "url": "https://attack.mitre.org/techniques/T1059/007/",
        "parent_id": "T1059",
    },
    "T1053": {
        "name": "Scheduled Task/Job",
        "tactic": "Execution, Persistence, Privilege Escalation",
        "platforms": ["Windows", "Linux", "macOS", "Containers"],
        "data_sources": ["Scheduled Job", "Process", "Command"],
        "mitigations": [{"id": "M1028", "name": "Operating System Configuration"},
                        {"id": "M1018", "name": "User Account Management"}],
        "description": "Adversaries may abuse task scheduling to facilitate initial or recurring execution.",
        "url": "https://attack.mitre.org/techniques/T1053/",
        "parent_id": None,
    },
    "T1053.003": {
        "name": "Cron",
        "tactic": "Execution, Persistence, Privilege Escalation",
        "platforms": ["Linux", "macOS"],
        "data_sources": ["Scheduled Job", "File", "Process"],
        "mitigations": [{"id": "M1022", "name": "Restrict File and Directory Permissions"}],
        "description": "Adversaries may abuse the cron utility for scheduled execution.",
        "url": "https://attack.mitre.org/techniques/T1053/003/",
        "parent_id": "T1053",
    },
    "T1053.005": {
        "name": "Scheduled Task",
        "tactic": "Execution, Persistence, Privilege Escalation",
        "platforms": ["Windows"],
        "data_sources": ["Scheduled Job", "Process", "Command"],
        "mitigations": [{"id": "M1028", "name": "Operating System Configuration"}],
        "description": "Adversaries may abuse Windows Task Scheduler for execution and persistence.",
        "url": "https://attack.mitre.org/techniques/T1053/005/",
        "parent_id": "T1053",
    },
    # ----- C2 / Transfer -----
    "T1071": {
        "name": "Application Layer Protocol",
        "tactic": "Command and Control",
        "platforms": ["Windows", "Linux", "macOS", "Network"],
        "data_sources": ["Network Traffic", "Application Log"],
        "mitigations": [{"id": "M1031", "name": "Network Intrusion Prevention"},
                        {"id": "M1037", "name": "Filter Network Traffic"}],
        "description": "Adversaries may communicate using application layer protocols to avoid detection.",
        "url": "https://attack.mitre.org/techniques/T1071/",
        "parent_id": None,
    },
    "T1071.001": {
        "name": "Web Protocols",
        "tactic": "Command and Control",
        "platforms": ["Windows", "Linux", "macOS", "Network"],
        "data_sources": ["Network Traffic", "Application Log"],
        "mitigations": [{"id": "M1031", "name": "Network Intrusion Prevention"}],
        "description": "Adversaries may communicate using application layer protocols associated with web traffic (HTTP/S).",
        "url": "https://attack.mitre.org/techniques/T1071/001/",
        "parent_id": "T1071",
    },
    "T1071.004": {
        "name": "DNS",
        "tactic": "Command and Control",
        "platforms": ["Windows", "Linux", "macOS", "Network"],
        "data_sources": ["Network Traffic", "Application Log"],
        "mitigations": [{"id": "M1037", "name": "Filter Network Traffic"}],
        "description": "Adversaries may communicate using the DNS application layer protocol for C2.",
        "url": "https://attack.mitre.org/techniques/T1071/004/",
        "parent_id": "T1071",
    },
    "T1105": {
        "name": "Ingress Tool Transfer",
        "tactic": "Command and Control",
        "platforms": ["Windows", "Linux", "macOS"],
        "data_sources": ["Network Traffic", "File", "Command", "Process"],
        "mitigations": [{"id": "M1031", "name": "Network Intrusion Prevention"},
                        {"id": "M1049", "name": "Antivirus/Antimalware"}],
        "description": "Adversaries may transfer tools or other files from an external system into a compromised environment.",
        "url": "https://attack.mitre.org/techniques/T1105/",
        "parent_id": None,
    },
    # ----- Discovery / Impact -----
    "T1046": {
        "name": "Network Service Discovery",
        "tactic": "Discovery",
        "platforms": ["Windows", "Linux", "macOS", "Network", "Containers", "IaaS"],
        "data_sources": ["Network Traffic", "Command", "Process"],
        "mitigations": [{"id": "M1042", "name": "Disable or Remove Feature or Program"},
                        {"id": "M1030", "name": "Network Segmentation"}],
        "description": "Adversaries may attempt to get a listing of services running on remote hosts.",
        "url": "https://attack.mitre.org/techniques/T1046/",
        "parent_id": None,
    },
    "T1486": {
        "name": "Data Encrypted for Impact",
        "tactic": "Impact",
        "platforms": ["Windows", "Linux", "macOS", "IaaS"],
        "data_sources": ["File", "Process", "Command", "Cloud Storage"],
        "mitigations": [{"id": "M1053", "name": "Data Backup"},
                        {"id": "M1040", "name": "Behavior Prevention on Endpoint"}],
        "description": "Adversaries may encrypt data on target systems to interrupt availability (ransomware).",
        "url": "https://attack.mitre.org/techniques/T1486/",
        "parent_id": None,
    },
}


def all_technique_ids() -> Set[str]:
    return set(ATTACK_CATALOG.keys())


def parent_ids() -> Set[str]:
    return {tid for tid, m in ATTACK_CATALOG.items() if not m.get("parent_id")}


def get_technique(technique_id: str) -> Optional[Dict[str, Any]]:
    if not technique_id:
        return None
    tid = technique_id.strip().upper()
    # normalize T1110.001 style
    if tid.count(".") == 1:
        parent, sub = tid.split(".", 1)
        tid = f"{parent}.{sub}"
    return ATTACK_CATALOG.get(tid)


def parent_of(technique_id: str) -> Optional[str]:
    meta = get_technique(technique_id)
    if not meta:
        # try as parent-style
        return None
    return meta.get("parent_id")


def root_id(technique_id: str) -> str:
    """Return parent technique id (T1110 for T1110.003, else self)."""
    tid = (technique_id or "").strip().upper()
    p = parent_of(tid)
    return p or tid


def children_of(parent_id: str) -> List[str]:
    pid = (parent_id or "").strip().upper()
    return sorted(
        tid for tid, m in ATTACK_CATALOG.items() if m.get("parent_id") == pid
    )


def is_known_technique(technique_id: str) -> bool:
    return get_technique(technique_id) is not None


def catalog_entry_for_api(technique_id: str) -> Optional[Dict[str, Any]]:
    meta = get_technique(technique_id)
    if not meta:
        return None
    tid = technique_id.strip().upper()
    if tid.count(".") == 1:
        parent, sub = tid.split(".", 1)
        tid = f"{parent}.{sub}"
    return {
        "technique_id": tid,
        "name": meta["name"],
        "tactic": meta["tactic"],
        "platforms": meta.get("platforms") or [],
        "data_sources": meta.get("data_sources") or [],
        "mitigations": meta.get("mitigations") or [],
        "description": meta.get("description") or "",
        "url": meta.get("url") or "",
        "parent_id": meta.get("parent_id"),
        "subtechniques": children_of(tid) if not meta.get("parent_id") else [],
    }


def list_catalog() -> List[Dict[str, Any]]:
    out = []
    for tid in sorted(ATTACK_CATALOG.keys()):
        entry = catalog_entry_for_api(tid)
        if entry:
            out.append(entry)
    return out
