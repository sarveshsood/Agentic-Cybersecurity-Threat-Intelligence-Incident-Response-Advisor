"""Knowledge base with hybrid BM25 + LanceDB ANN retrieval (RRF fusion).

Dense path uses local LanceDB under ``backend/data/lancedb/`` with a pluggable
embedder (default: offline hashing). BM25 remains the always-on fallback.
"""
from __future__ import annotations

import logging
import os
import re
from typing import Any, Dict, List, Optional

from rank_bm25 import BM25Okapi

logger = logging.getLogger(__name__)

KB_DOCS: List[Dict[str, Any]] = [
    # MITRE ATT&CK Techniques
    {"id": "T1078", "source": "MITRE ATT&CK", "title": "Valid Accounts",
     "tactic": "Initial Access, Persistence, Privilege Escalation, Defense Evasion",
     "text": "Adversaries may obtain and abuse credentials of existing accounts as a means of gaining Initial Access, Persistence, Privilege Escalation, or Defense Evasion. Mitigate by enforcing MFA, disabling stale accounts, and monitoring anomalous authentication events."},
    {"id": "T1110", "source": "MITRE ATT&CK", "title": "Brute Force", "tactic": "Credential Access",
     "text": "Adversaries may use brute force techniques to gain access to accounts when passwords are unknown. Countermeasures include account lockouts, rate limiting, MFA, and monitoring for repeated failed logons."},
    {"id": "T1566", "source": "MITRE ATT&CK", "title": "Phishing", "tactic": "Initial Access",
     "text": "Adversaries may send phishing messages to gain access to victim systems. Response: quarantine emails, reset credentials, block sender domains, run phishing awareness."},
    {"id": "T1059", "source": "MITRE ATT&CK", "title": "Command and Scripting Interpreter", "tactic": "Execution",
     "text": "Adversaries may abuse command and script interpreters to execute commands, scripts, or binaries. Monitor process creation and PowerShell script block logging."},
    {"id": "T1071", "source": "MITRE ATT&CK", "title": "Application Layer Protocol", "tactic": "Command and Control",
     "text": "Adversaries may communicate using application layer protocols associated with web traffic to avoid detection. Inspect TLS SNI, DNS queries and block C2 domains at proxy."},
    {"id": "T1486", "source": "MITRE ATT&CK", "title": "Data Encrypted for Impact", "tactic": "Impact",
     "text": "Adversaries may encrypt data on target systems to interrupt availability (ransomware). Isolate hosts, disable file share access, restore from immutable backups."},
    {"id": "T1046", "source": "MITRE ATT&CK", "title": "Network Service Scanning", "tactic": "Discovery",
     "text": "Adversaries may attempt to get a listing of services running on remote hosts. Detect via NetFlow anomalies and rate-based IDS alerts."},
    {"id": "T1190", "source": "MITRE ATT&CK", "title": "Exploit Public-Facing Application", "tactic": "Initial Access",
     "text": "Adversaries may attempt to exploit weaknesses in Internet-facing applications. Patch aggressively, deploy WAF, restrict inbound to allowlisted paths."},
    {"id": "T1053", "source": "MITRE ATT&CK", "title": "Scheduled Task/Job",
     "tactic": "Execution, Persistence, Privilege Escalation",
     "text": "Adversaries may abuse task scheduling functionality to facilitate initial or recurring execution of malicious code."},
    {"id": "T1105", "source": "MITRE ATT&CK", "title": "Ingress Tool Transfer", "tactic": "Command and Control",
     "text": "Adversaries may transfer tools or other files from an external system into a compromised environment. Egress filter binary downloads from user endpoints."},

    # NIST SP 800-61 Incident Handling
    {"id": "NIST-800-61-4.3", "source": "NIST SP 800-61 Rev.2", "title": "Containment Strategy",
     "text": "Containment provides time for developing a tailored remediation strategy. Isolate affected systems from the network, preserve forensic evidence, and document actions in the timeline."},
    {"id": "NIST-800-61-4.4", "source": "NIST SP 800-61 Rev.2", "title": "Eradication and Recovery",
     "text": "Eradication involves eliminating components of the incident (e.g. deleting malware, disabling breached user accounts). Recovery restores systems to operation and verifies integrity."},
    {"id": "NIST-800-61-3.3", "source": "NIST SP 800-61 Rev.2", "title": "Detection and Analysis",
     "text": "Analysts should correlate events across sources, prioritize by functional/informational/recoverability impact, and notify appropriate stakeholders."},
    {"id": "NIST-800-61-4.5", "source": "NIST SP 800-61 Rev.2", "title": "Lessons Learned",
     "text": "After significant incidents, hold a retrospective covering root cause, effectiveness of response, and improvements to detection and IR playbooks."},

    # CISA KEV
    {"id": "CISA-KEV-Log4Shell", "source": "CISA KEV Catalog", "title": "CVE-2021-44228 Log4Shell",
     "text": "Apache Log4j remote code execution vulnerability. Immediate action: patch to Log4j 2.17+, block outbound LDAP/RMI from application servers, hunt for JNDI strings in logs."},
    {"id": "CISA-KEV-ProxyShell", "source": "CISA KEV Catalog", "title": "CVE-2021-34473 ProxyShell",
     "text": "Microsoft Exchange Server RCE chain. Apply CU updates, review OWA for suspicious webshells (.aspx), reset service accounts."},
    {"id": "CISA-KEV-MOVEit", "source": "CISA KEV Catalog", "title": "CVE-2023-34362 MOVEit Transfer",
     "text": "SQL injection in Progress MOVEit Transfer allows data theft (CL0P). Patch immediately, hunt for LEMURLOOT webshell, audit outbound transfers."},

    # Generic playbook guidance
    {"id": "PB-BRUTEFORCE", "source": "SOC Playbook Library", "title": "Brute Force Response",
     "text": "Steps for brute force response: (1) block source IP at edge firewall, (2) lock affected account, (3) enable MFA if not present, (4) review VPN/RDP logs for successful logins from source, (5) rotate credentials, (6) update detection thresholds."},
    {"id": "PB-MALWARE", "source": "SOC Playbook Library", "title": "Malware Infection Response",
     "text": "Steps: isolate host from network, capture memory & disk image, submit hash to sandbox, kill malicious processes, remove persistence (scheduled tasks, run keys), re-image, restore data from clean backup."},
    {"id": "PB-PHISHING", "source": "SOC Playbook Library", "title": "Phishing Response",
     "text": "Steps: quarantine email in mailboxes, block sender at gateway, reset credentials of clicked users, hunt for lateral movement, run tabletop with users."},
    {"id": "PB-C2", "source": "SOC Playbook Library", "title": "Command and Control Response",
     "text": "Steps: sinkhole malicious domain at DNS, block IP at firewall, isolate beaconing host, capture PCAP for analysis, extract implant, hunt for other hosts contacting same infra."},
    {"id": "PB-RANSOMWARE", "source": "SOC Playbook Library", "title": "Ransomware Response",
     "text": "Steps: pull affected hosts from network, do NOT pay ransom, engage legal & IR retainer, identify strain via note & extension, restore from immutable backups, rotate all privileged credentials, notify regulators."},
]


def _tokenize(text: str) -> List[str]:
    return re.findall(r"[a-z0-9]+", text.lower())


def _retrieval_mode() -> str:
    """bm25 | hybrid | dense — default hybrid when vector store on."""
    mode = (os.environ.get("ACTIRA_RETRIEVAL_MODE") or "hybrid").strip().lower()
    if mode in ("bm25", "hybrid", "dense"):
        return mode
    return "hybrid"


class KnowledgeBase:
    def __init__(self, docs: List[Dict[str, Any]]):
        self.docs = docs
        self._by_id = {d["id"]: d for d in docs}
        self.corpus_tokens = [_tokenize(d["title"] + " " + d["text"]) for d in docs]
        self.bm25 = BM25Okapi(self.corpus_tokens)
        self._vector_ready = False
        self._try_init_vectors()

    def _try_init_vectors(self) -> None:
        try:
            from backend.vector_store import ensure_kb_indexed, vector_store_enabled

            if not vector_store_enabled():
                self._vector_ready = False
                return
            result = ensure_kb_indexed(self.docs)
            self._vector_ready = bool(result.get("ok"))
            if self._vector_ready:
                logger.info(
                    "KB vector index ready rows=%s embedder=%s",
                    result.get("rows"),
                    result.get("embedder"),
                )
        except Exception as e:
            logger.warning("KB vector init skipped: %s", e)
            self._vector_ready = False

    def reindex_vectors(self) -> Dict[str, Any]:
        from backend.vector_store import reindex_kb

        result = reindex_kb(self.docs)
        self._vector_ready = bool(result.get("ok"))
        return result

    def _rebuild_bm25(self) -> None:
        self._by_id = {d["id"]: d for d in self.docs}
        self.corpus_tokens = [_tokenize(d["title"] + " " + d["text"]) for d in self.docs]
        self.bm25 = BM25Okapi(self.corpus_tokens) if self.docs else BM25Okapi([["empty"]])

    def add_custom_doc(
            self,
            *,
            doc_id: str,
            title: str,
            text: str,
            source: str = "Custom",
            tactic: str = "",
    ) -> Dict[str, Any]:
        """A-K2: add/update a custom KB document and refresh BM25 (+ vectors optional)."""
        doc_id = (doc_id or "").strip()
        if not doc_id:
            raise ValueError("doc_id required")
        if not re.match(r"^[A-Za-z0-9][A-Za-z0-9._-]{1,63}$", doc_id):
            raise ValueError("doc_id must be 2–64 chars: alnum, dot, underscore, hyphen")
        title = (title or "").strip() or doc_id
        text = (text or "").strip()
        if len(text) < 20:
            raise ValueError("text too short (min 20 chars)")
        doc = {
            "id": doc_id,
            "source": (source or "Custom").strip() or "Custom",
            "title": title[:300],
            "tactic": (tactic or "").strip(),
            "text": text[:20000],
            "custom": True,
        }
        # replace existing id
        self.docs = [d for d in self.docs if d.get("id") != doc_id]
        self.docs.append(doc)
        self._rebuild_bm25()
        try:
            self.reindex_vectors()
        except Exception as e:
            logger.warning("vector reindex after custom doc failed: %s", e)
        return doc

    def list_custom_docs(self) -> List[Dict[str, Any]]:
        return [d for d in self.docs if d.get("custom")]

    def remove_custom_doc(self, doc_id: str) -> bool:
        before = len(self.docs)
        self.docs = [d for d in self.docs if not (d.get("id") == doc_id and d.get("custom"))]
        if len(self.docs) == before:
            return False
        self._rebuild_bm25()
        try:
            self.reindex_vectors()
        except Exception as e:
            logger.warning("vector reindex after remove failed: %s", e)
        return True

    def load_custom_docs(self, docs: List[Dict[str, Any]]) -> int:
        """Merge custom docs from Mongo at startup (idempotent by id)."""
        n = 0
        for d in docs or []:
            if not isinstance(d, dict) or not d.get("id"):
                continue
            d = {**d, "custom": True}
            self.docs = [x for x in self.docs if x.get("id") != d["id"]]
            self.docs.append(d)
            n += 1
        if n:
            self._rebuild_bm25()
        return n

    def search_bm25(self, query: str, top_k: int = 5) -> List[Dict[str, Any]]:
        tokens = _tokenize(query)
        if not tokens:
            return []
        scores = self.bm25.get_scores(tokens)
        ranked = sorted(enumerate(scores), key=lambda x: x[1], reverse=True)[:top_k]
        return [{**self.docs[i], "score": float(s), "retriever": "bm25"} for i, s in ranked if s > 0]

    def search_dense(self, query: str, top_k: int = 8) -> List[Dict[str, Any]]:
        if not self._vector_ready:
            self._try_init_vectors()
        if not self._vector_ready:
            return []
        try:
            from backend.embeddings import get_embedder
            from backend.vector_store import search_kb

            emb = get_embedder()
            if emb.dim <= 0:
                return []
            qv = emb.embed_query(query or "")
            hits = search_kb(qv, top_k=top_k)
            out: List[Dict[str, Any]] = []
            for h in hits:
                doc = self._by_id.get(h.get("id"))
                if not doc:
                    # allow orphan rows still useful for display
                    doc = {
                        "id": h.get("id"),
                        "source": h.get("source"),
                        "title": h.get("title"),
                        "text": h.get("text"),
                    }
                dist = h.get("_distance")
                # Lance L2 distance → similarity-ish score
                score = 1.0 / (1.0 + float(dist)) if dist is not None else 0.5
                out.append({**doc, "score": float(score), "retriever": "dense", "_distance": dist})
            return out
        except Exception as e:
            logger.warning("dense search failed: %s", e)
            return []

    def search(
            self,
            query: str,
            top_k: int = 5,
            *,
            mode: Optional[str] = None,
            candidate_k: int = 20,
            settings: Optional[Dict[str, Any]] = None,
            rerank: Optional[bool] = None,
            cohere_api_key: Optional[str] = None,
    ) -> List[Dict[str, Any]]:
        """Hybrid BM25 + dense ANN with Reciprocal Rank Fusion (default).

        Optional Cohere (or lexical) re-rank on the fused candidate pool when
        enabled and a key/backend is available — see ``reranker.maybe_rerank``.
        """
        mode = (mode or _retrieval_mode()).lower()
        pool = max(int(candidate_k), int(top_k) * 2, 20)

        if mode == "bm25":
            results = self.search_bm25(query, top_k=pool)
        elif mode == "dense":
            dense = self.search_dense(query, top_k=pool)
            results = dense if dense else self.search_bm25(query, top_k=pool)
        else:
            # hybrid
            bm25 = self.search_bm25(query, top_k=pool)
            dense = self.search_dense(query, top_k=pool)

            if not dense:
                results = bm25
            elif not bm25:
                results = dense
            else:
                try:
                    from backend.vector_store import rrf_scores

                    bm25_ids = [d["id"] for d in bm25]
                    dense_ids = [d["id"] for d in dense]
                    fused = rrf_scores([bm25_ids, dense_ids], k=60)
                    bm25_map = {d["id"]: d for d in bm25}
                    dense_map = {d["id"]: d for d in dense}
                    ordered = sorted(fused.items(), key=lambda x: x[1], reverse=True)[:pool]
                    results = []
                    for doc_id, rrf in ordered:
                        base = self._by_id.get(doc_id) or bm25_map.get(doc_id) or dense_map.get(doc_id)
                        if not base:
                            continue
                        results.append(
                            {
                                **{k: v for k, v in base.items() if k not in ("score", "retriever", "_distance")},
                                "score": float(rrf),
                                "retriever": "hybrid",
                                "bm25_score": float(bm25_map[doc_id]["score"]) if doc_id in bm25_map else None,
                                "dense_score": float(dense_map[doc_id]["score"]) if doc_id in dense_map else None,
                            }
                        )
                    if not results:
                        results = bm25
                except Exception as e:
                    logger.warning("RRF fusion failed, BM25 only: %s", e)
                    results = bm25

        # Optional re-rank (Cohere live or lexical offline) then cut to top_k
        try:
            from backend.reranker import maybe_rerank

            results = maybe_rerank(
                query,
                results,
                settings=settings,
                top_n=top_k,
                api_key=cohere_api_key,
                enabled=rerank,
            )
        except Exception as e:
            logger.warning("rerank skipped: %s", e)

        return results[:top_k]

    def get_by_id(self, doc_id: str):
        return self._by_id.get(doc_id)

    def vector_status(self) -> Dict[str, Any]:
        try:
            from backend.vector_store import status

            st = status()
            st["kb_docs"] = len(self.docs)
            st["vector_ready"] = self._vector_ready
            return st
        except Exception as e:
            return {"ok": False, "error": str(e), "vector_ready": False}


kb = KnowledgeBase(KB_DOCS)

# ---------- ATT&CK mapping (sub-techniques + evidence) ----------
# Implementation lives in attack_mapping.py / attack_catalog.py (A-K4 drill-down).
from backend.attack_mapping import infer_techniques  # noqa: E402,F401
from backend.attack_mapping import _KEYWORD_RULES as _KR  # noqa: E402

# Back-compat: tests/docs that expect ATTACK_KEYWORDS: tid → list[str]
ATTACK_KEYWORDS: Dict[str, List[str]] = {}
for _tid, _kws, _w in _KR:
    ATTACK_KEYWORDS.setdefault(_tid, [])
    for _k in _kws:
        if _k not in ATTACK_KEYWORDS[_tid]:
            ATTACK_KEYWORDS[_tid].append(_k)
