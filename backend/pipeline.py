"""Async pipeline orchestrator with multi-file + ZIP support and cross-log correlation."""
import asyncio
import io
import logging
import zipfile
from datetime import datetime, timezone
from typing import Dict, List, Tuple

from backend.correlator import correlate_events
from backend.enrichment import enrich_ioc
from backend.hitl_gate import decide_incident_status
from backend.ioc_extractor import extract_iocs
from backend.job_status import mark_job_failed
from backend.knowledge_base import infer_techniques
from backend.models import (
    Incident, TimelineEvent, ATTACKTechnique, IoC, new_id,
)
from backend.parsers import detect_and_parse
from backend.playbook_agent import generate_playbook

logger = logging.getLogger(__name__)

MAX_ZIP_MEMBERS = 50
MAX_UNCOMPRESSED_BYTES = 50 * 1024 * 1024  # 50 MB ZIP-bomb guard


def _severity_from(score: float, technique_count: int, critical_events: int) -> str:
    if score >= 80 or technique_count >= 5 or critical_events >= 5:
        return "critical"
    if score >= 60 or technique_count >= 3 or critical_events >= 2:
        return "high"
    if score >= 30 or technique_count >= 1:
        return "medium"
    return "low"


def _expand_zip(name: str, data: bytes) -> List[Tuple[str, bytes]]:
    """Return [(inner_name, bytes)] extracted safely."""
    out: List[Tuple[str, bytes]] = []
    try:
        with zipfile.ZipFile(io.BytesIO(data)) as zf:
            total = 0
            for info in zf.infolist()[:MAX_ZIP_MEMBERS]:
                if info.is_dir():
                    continue
                if info.file_size > MAX_UNCOMPRESSED_BYTES:
                    continue
                total += info.file_size
                if total > MAX_UNCOMPRESSED_BYTES:
                    break
                out.append((f"{name}/{info.filename}", zf.read(info.filename)))
    except zipfile.BadZipFile:
        logger.warning(f"Not a valid zip: {name}")
    return out


def flatten_uploads(files: List[Tuple[str, bytes]]) -> List[Tuple[str, bytes]]:
    """Expand any ZIP archives into their members. Returns [(filename, bytes)]."""
    result: List[Tuple[str, bytes]] = []
    for name, data in files:
        if name.lower().endswith(".zip") or (data[:2] == b"PK"):
            result.extend(_expand_zip(name, data))
        else:
            result.append((name, data))
    return result


async def run_batch_pipeline(db, job_id: str, files: List[Tuple[str, bytes]], user_id: str, settings: dict):
    """Multi-file / ZIP pipeline: parse each file → CES → correlate → single incident."""

    async def update_job(status: str, progress: int, **extra):
        await db.log_jobs.update_one({"id": job_id}, {"$set": {"status": status, "progress": progress, **extra}})

    try:
        # 1. Expand ZIPs
        await update_job("parsing", 10)
        expanded = flatten_uploads(files)
        await db.log_jobs.update_one(
            {"id": job_id},
            {"$set": {"expanded_files": [n for n, _ in expanded]}},
        )

        # 2. Detect + parse every file → CES events (isolate per-file failures)
        await update_job("extracting", 25)
        all_events = []
        per_file_meta = []
        for name, data in expanded:
            try:
                fmt, evts = detect_and_parse(data, name)
                per_file_meta.append({
                    "file": name, "format": fmt, "events": len(evts), "size": len(data),
                })
                all_events.extend(evts)
            except Exception as parse_err:
                logger.warning(
                    "[job %s] parse failed for %s: %s",
                    job_id, name, parse_err,
                )
                per_file_meta.append({
                    "file": name,
                    "format": "error",
                    "events": 0,
                    "size": len(data) if data is not None else 0,
                    "error": str(parse_err)[:500],
                })
        logger.info(f"[job {job_id}] parsed {len(all_events)} CES events across {len(expanded)} files")

        # 3. Correlate across files (A-P1: honour correlation_window_minutes)
        await update_job("correlating", 45)
        try:
            window_m = int(settings.get("correlation_window_minutes") or 0) or None
        except (TypeError, ValueError):
            window_m = None
        correlation = correlate_events(all_events, window_minutes=window_m)

        # 4. IoC extraction over combined raw text
        raw_blob = "\n".join(ev.get("raw", "") for ev in all_events)
        iocs = extract_iocs(raw_blob)
        # A-P2: cap enrichment volume (settings override; default 50)
        try:
            max_iocs = int(settings.get("max_enrich_iocs") or 50)
        except (TypeError, ValueError):
            max_iocs = 50
        max_iocs = max(1, min(max_iocs, 200))
        if len(iocs) > max_iocs:
            # Prefer public high-confidence types first
            def _ioc_rank(x):
                order = {"hash_sha256": 0, "hash_sha1": 1, "hash_md5": 2, "ip": 3, "domain": 4, "url": 5, "cve": 6,
                         "email": 7}
                return (order.get(getattr(x, "type", ""), 9), -float(getattr(x, "confidence", 0) or 0))

            iocs = sorted(iocs, key=_ioc_rank)[:max_iocs]
            logger.info("[job %s] capped IoCs for enrichment to %s", job_id, max_iocs)
        # 5. Enrich in parallel — isolate failures + cache (A-E2)
        await update_job("enriching", 60)
        enriched = await _enrich_all(iocs, settings, db=db)

        # 6. Infer ATT&CK techniques (sub-techniques + CES evidence + optional LLM refine)
        techniques_data = infer_techniques(raw_blob, list(enriched), events=all_events)
        if settings.get("llm_technique_refine"):
            try:
                from backend.attack_mapping import refine_techniques_with_llm
                techniques_data = await refine_techniques_with_llm(
                    raw_blob,
                    techniques_data,
                    settings=settings,
                    provider=str(settings.get("llm_provider") or "anthropic"),
                    model=str(settings.get("llm_model") or "claude-sonnet-4-6"),
                )
            except Exception as refine_err:
                logger.warning("[job %s] LLM technique refine skipped: %s", job_id, refine_err)
        techniques = []
        for t in techniques_data:
            try:
                techniques.append(ATTACKTechnique.model_validate(t))
            except Exception as tech_err:
                logger.warning(
                    "[job %s] skip technique row %s: %s",
                    job_id, (t or {}).get("technique_id"), tech_err,
                )
                try:
                    techniques.append(ATTACKTechnique(
                        technique_id=str((t or {}).get("technique_id") or "unknown"),
                        name=str((t or {}).get("name") or (t or {}).get("technique_id") or "unknown"),
                        tactic=str((t or {}).get("tactic") or ""),
                        confidence=float((t or {}).get("confidence") or 0.5),
                    ))
                except Exception:
                    pass

        # 7. Compute scores + severity
        top_scores = sorted([i.threat_score for i in enriched], reverse=True)[:5]
        avg_score = round(sum(top_scores) / len(top_scores), 1) if top_scores else 0.0
        critical_evt_count = correlation["stats"]["severity_counts"].get("critical", 0) + \
                             correlation["stats"]["severity_counts"].get("high", 0)
        severity = _severity_from(avg_score, len(techniques), critical_evt_count)

        # 8. Summary + title
        title = _make_title(techniques_data, correlation)
        summary = _make_summary(techniques_data, list(enriched), correlation, expanded)

        # 9. Playbook
        await update_job("generating", 85)
        provider = settings.get("llm_provider", "anthropic")
        model = settings.get("llm_model", "claude-sonnet-4-6")
        playbook = await generate_playbook(
            summary, list(enriched), techniques_data, provider, model, settings=settings,
        )

        # 10. HiTL gate + auto-approve (honours hitl_severity_min; never auto-bypasses severity gate)
        # A-L3: pure template fallback playbooks always require HiTL
        grounding_for_gate = float(playbook.grounding_score or 0)
        if (playbook.llm_provider or "") in ("template", "fallback"):
            grounding_for_gate = min(grounding_for_gate, 0.49)
        status, hitl_required, auto_approved = decide_incident_status(
            severity,
            grounding_for_gate,
            grounding_threshold=float(settings.get("grounding_threshold", 0.7)),
            hitl_severity_min=str(settings.get("hitl_severity_min") or "critical"),
            auto_approve_grounding_min=float(settings.get("auto_approve_grounding_min", 0.9)),
        )
        if (playbook.llm_provider or "") in ("template", "fallback"):
            hitl_required = True
            if status != "pending_review" and status != "approved":
                status = "pending_review"
            if auto_approved:
                auto_approved = False
                status = "pending_review"
        if auto_approved:
            logger.info(
                "[job %s] auto-approved (severity=%s grounding=%.2f)",
                job_id, severity, playbook.grounding_score,
            )

        incident = Incident(
            title=title,
            source_log_id=job_id,
            created_by=user_id,
            severity=severity,
            status=status,
            iocs=list(enriched),
            techniques=techniques,
            timeline=[
                TimelineEvent(label="Files ingested", detail=f"{len(expanded)} file(s)"),
                TimelineEvent(label="Events parsed", detail=f"{len(all_events)} CES events"),
                TimelineEvent(label="Cross-log correlation", detail=f"{len(correlation['correlations'])} correlations"),
                TimelineEvent(label="Enrichment complete", detail=f"threat score {avg_score}"),
                TimelineEvent(label="ATT&CK mapping", detail=f"{len(techniques)} techniques"),
                TimelineEvent(label="Playbook generated", detail=f"grounding {playbook.grounding_score}"),
            ],
            threat_score=avg_score,
            playbook=playbook,
            hitl_required=hitl_required,
            summary=summary,
            # A-P5: first-class correlation + per-file meta
            correlation=correlation,
            files_meta=per_file_meta,
        )

        # A-H2: keep native datetime for created_at (not JSON ISO strings)
        from backend.mongo_util import to_mongo_doc

        doc = to_mongo_doc(incident)
        await db.incidents.insert_one(doc)

        # Best-effort: index incident narrative into local LanceDB for similar-case search
        try:
            from backend.vector_store import upsert_incident

            narrative = " ".join(
                filter(
                    None,
                    [
                        title,
                        summary,
                        " ".join(t.technique_id for t in techniques[:8]),
                        " ".join(
                            f"{i.type}:{i.value}" for i in list(enriched)[:12]
                        ),
                    ],
                )
            )
            await asyncio.to_thread(
                upsert_incident,
                incident.id,
                title,
                narrative,
                metadata={
                    "severity": severity,
                    "status": status,
                    "threat_score": avg_score,
                    "job_id": job_id,
                },
            )
        except Exception as vec_err:
            logger.warning("[job %s] incident vector upsert skipped: %s", job_id, vec_err)

        await update_job("done", 100, incident_ids=[incident.id], files_meta=per_file_meta)

        await db.audit_log.insert_one({
            "id": new_id(),
            "ts": datetime.now(timezone.utc).isoformat(),
            "actor_id": user_id,
            "actor_email": "system",
            "action": "incident.created",
            "target_type": "incident",
            "target_id": incident.id,
            "detail": {
                "severity": severity,
                "hitl_required": hitl_required,
                "auto_approved": auto_approved,
                "status": status,
                "hitl_severity_min": settings.get("hitl_severity_min", "critical"),
                "files": len(expanded),
            },
        })

        # Critical / high / HiTL → Slack + email (best-effort; never fail the job)
        try:
            from backend.notifications import notify_incident_created
            notify_incident_created(settings, doc)
        except Exception as notify_err:
            logger.warning("[job %s] alert notify failed: %s", job_id, notify_err)

    except Exception as e:
        logger.exception(f"[job {job_id}] batch pipeline failed: {e}")
        await mark_job_failed(
            db,
            job_id,
            str(e),
            failed_at=datetime.now(timezone.utc).isoformat(),
        )


async def _enrich_all(iocs: List[IoC], settings: dict, db=None) -> List[IoC]:
    """Enrich IoCs in parallel with optional cache (A-E2); isolate failures."""
    if not iocs:
        return []
    from backend.enrichment_cache import (
        apply_cached_to_ioc,
        make_key,
        mem_get,
        mem_put,
        mode_signature,
        mongo_get,
        mongo_put,
        snapshot_ioc,
        _ttl_seconds,
    )
    from backend.enrichment import _app_env, _force_mock_env, _key

    ttl = _ttl_seconds(settings)
    force_mock = False  # pipeline uses live/settings path; golden passes force_mock separately
    env = _app_env()
    allow_mock = _force_mock_env() or env in ("dev", "test", "local", "")
    has_key = any(
        _key(settings, f, e)
        for f, e in (
            ("abuseipdb_key", "ABUSEIPDB_API_KEY"),
            ("virustotal_key", "VIRUSTOTAL_API_KEY"),
            ("greynoise_key", "GREYNOISE_API_KEY"),
            ("threatfox_key", "THREATFOX_API_KEY"),
            ("otx_api_key", "OTX_API_KEY"),
            ("shodan_api_key", "SHODAN_API_KEY"),
        )
    )
    mode_sig = mode_signature(
        force_mock=force_mock, allow_mock=allow_mock, has_any_key=has_key,
    )

    need: List[IoC] = []
    cached_out: Dict[int, IoC] = {}
    for idx, ioc in enumerate(iocs):
        if ttl <= 0:
            need.append(ioc)
            continue
        key = make_key(ioc.type, ioc.value, mode_sig)
        payload = mem_get(key)
        if not payload and db is not None:
            payload = await mongo_get(db, key)
            if payload:
                mem_put(key, payload, ttl)
        if payload:
            try:
                copy = ioc.model_copy(deep=True)
            except Exception:
                copy = ioc
            cached_out[idx] = apply_cached_to_ioc(copy, payload)
        else:
            need.append(ioc)

    results_map: Dict[str, IoC] = {}
    if need:
        results = await asyncio.gather(
            *[asyncio.to_thread(enrich_ioc, i, settings) for i in need],
            return_exceptions=True,
        )
        for original, result in zip(need, results):
            if isinstance(result, Exception):
                logger.warning(
                    "enrich_ioc failed for %s=%s: %s — keeping unenriched IoC",
                    getattr(original, "type", "?"),
                    str(getattr(original, "value", ""))[:40],
                    type(result).__name__,
                )
                try:
                    fallback = original.model_copy(deep=True)
                except Exception:
                    fallback = original
                try:
                    fallback.threat_score = float(getattr(fallback, "threat_score", 0) or 0)
                    fallback.enrichment = {
                        "error": type(result).__name__,
                        "detail": str(result)[:300],
                        "fallback": True,
                    }
                except Exception:
                    pass
                results_map[id(original)] = fallback
            else:
                results_map[id(original)] = result
                if ttl > 0:
                    key = make_key(result.type, result.value, mode_sig)
                    snap = snapshot_ioc(result)
                    mem_put(key, snap, ttl)
                    if db is not None:
                        await mongo_put(db, key, snap, ttl)

    # rebuild original order
    out: List[IoC] = []
    need_i = 0
    for idx, ioc in enumerate(iocs):
        if idx in cached_out:
            out.append(cached_out[idx])
        else:
            # match by position in need list
            orig = need[need_i]
            need_i += 1
            out.append(results_map.get(id(orig), orig))
    return out


# Backwards-compatible single-file entrypoint (delegates to batch)
async def run_pipeline(
        db,
        job_id: str,
        log_text: str,
        user_id: str,
        settings: dict,
        *,
        filename: str = "upload.log",
):
    """Legacy single-file entrypoint — kept for API stability (A-P3: pass real name)."""
    name = (filename or "upload.log").strip() or "upload.log"
    await run_batch_pipeline(db, job_id, [(name, log_text.encode("utf-8"))], user_id, settings)


def _make_title(techniques, correlation) -> str:
    if techniques:
        return f"{techniques[0]['name']} activity detected ({techniques[0]['technique_id']})"
    top = correlation.get("correlations") or []
    if top:
        c = top[0]
        return f"Cross-log correlation on {c['kind']}={c['value']} ({c['file_count']} files)"
    stats = correlation.get("stats", {})
    return f"Log analysis ({stats.get('total_events', 0)} events)"


def _make_summary(techniques, iocs, correlation, expanded_files) -> str:
    parts = []
    if len(expanded_files) > 1:
        parts.append(
            f"Correlated across {len(expanded_files)} log files ({', '.join(n.split('/')[-1] for n, _ in expanded_files[:6])}).")
    if techniques:
        parts.append("Detected " + ", ".join(f"{t['technique_id']} ({t['name']})" for t in techniques[:5]) + ".")
    stats = correlation.get("stats", {})
    parts.append(
        f"{stats.get('total_events', 0)} events · "
        f"{stats.get('unique_source_ips', 0)} unique IPs · "
        f"{stats.get('unique_users', 0)} users · "
        f"{stats.get('unique_hosts', 0)} hosts."
    )
    if correlation.get("correlations"):
        top = correlation["correlations"][0]
        parts.append(
            f"Strongest cross-file link: {top['kind']} {top['value']} appears in {top['file_count']} files ({top['event_count']} events).")
    high = [i for i in iocs if i.threat_score >= 70]
    if high:
        parts.append(f"{len(high)} indicators scored ≥70 by threat intel.")
    return " ".join(parts)
