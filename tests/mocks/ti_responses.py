"""Reusable mock HTTP responses for TI / LLM providers (respx / responses)."""
from __future__ import annotations

from typing import Any, Dict


def virustotal_ip_ok(ip: str = "203.0.113.50") -> Dict[str, Any]:
    return {
        "data": {
            "id": ip,
            "type": "ip_address",
            "attributes": {
                "last_analysis_stats": {
                    "malicious": 5,
                    "suspicious": 2,
                    "harmless": 50,
                    "undetected": 10,
                }
            },
        }
    }


def abuseipdb_ok(ip: str = "203.0.113.50") -> Dict[str, Any]:
    return {
        "data": {
            "ipAddress": ip,
            "abuseConfidenceScore": 80,
            "totalReports": 12,
            "countryCode": "ZZ",
        }
    }


def greynoise_ok(ip: str = "203.0.113.50") -> Dict[str, Any]:
    return {"ip": ip, "noise": True, "riot": False, "classification": "malicious"}


def threatfox_ok() -> Dict[str, Any]:
    return {
        "query_status": "ok",
        "data": [
            {
                "ioc": "evil.example.com",
                "ioc_type": "domain",
                "threat_type": "botnet_cc",
                "confidence_level": 75,
            }
        ],
    }


def llm_playbook_json() -> Dict[str, Any]:
    return {
        "summary": "Mock offline playbook",
        "steps": [
            {
                "order": 1,
                "phase": "detect",
                "action": "Validate alerts",
                "citations": ["MITRE-T1110"],
            },
            {
                "order": 2,
                "phase": "contain",
                "action": "Block source",
                "citations": ["NIST-800-61"],
            },
        ],
    }


# Common failure shapes for negative tests
HTTP_429 = {"error": "rate_limit", "message": "Too many requests"}
HTTP_500 = {"error": "internal", "message": "upstream failure"}
HTTP_503 = {"error": "unavailable", "message": "service unavailable"}
MALFORMED_BODY = "<<<not-json>>>"
