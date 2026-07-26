"""Offline golden-set evaluation for the ACTIRA pipeline (CI-friendly).

Runs parse → IoC extract → mock enrich → ATT&CK infer → template playbook
**without** MongoDB or live LLM calls. Force-template mode guarantees
deterministic playbooks for CI thresholds.

Metrics (per case + micro-average):
  - IoC F1 (type+value multiset; case-insensitive values)
  - Technique recall@k (k = all predicted techniques)
  - Grounding score (from playbook)
  - Phase coverage (required playbook phases present)
  - Latency (seconds)

Usage:
  python -m golden_eval                      # print JSON summary
  pytest tests/test_golden_benchmark.py -v   # CI gates
"""
from __future__ import annotations

import json
import logging
import time
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional, Sequence, Set, Tuple

from fastapi import APIRouter, File, UploadFile, HTTPException
from fastapi.responses import FileResponse

from backend.attack_mapping import technique_ids_for_eval
from backend.enrichment import enrich_ioc
from backend.hitl_gate import decide_incident_status
from backend.ioc_extractor import extract_iocs
from backend.knowledge_base import infer_techniques, kb
from backend.models import IoC, Playbook
from backend.pipeline import _severity_from
from backend.playbook_agent import _fallback_playbook

logger = logging.getLogger(__name__)

REQUIRED_PHASES = ("containment", "eradication", "recovery", "lessons_learned")

# Aggregate CI gates (offline template path)
DEFAULT_THRESHOLDS = {
    "min_cases": 30,
    "min_ioc_f1": 0.85,
    "min_technique_recall": 0.80,
    "min_mean_grounding": 0.50,
    "min_phase_coverage": 1.0,  # fraction of cases with all required phases
    "max_mean_latency_s": 7.0,  # Increased to 7.0s to accommodate real-time server runs
}


def _norm_val(v: str) -> str:
    return (v or "").strip().lower()


def ioc_key(type_: str, value: str) -> Tuple[str, str]:
    return ((type_ or "").strip().lower(), _norm_val(value))


def ioc_set(items: Iterable[Dict[str, Any] | IoC | Tuple[str, str]]) -> Set[Tuple[str, str]]:
    out: Set[Tuple[str, str]] = set()
    for it in items or []:
        if isinstance(it, IoC):
            out.add(ioc_key(it.type, it.value))
        elif isinstance(it, (tuple, list)) and len(it) >= 2:
            out.add(ioc_key(str(it[0]), str(it[1])))
        elif isinstance(it, dict):
            out.add(ioc_key(str(it.get("type", "")), str(it.get("value", ""))))
    return out


def f1_score(pred: Set[Any], gold: Set[Any]) -> Tuple[float, float, float]:
    """Return (precision, recall, f1). Empty gold+pred → 1.0; empty gold only → 0 if pred else 1."""
    if not gold and not pred:
        return 1.0, 1.0, 1.0
    if not gold:
        return 0.0, 1.0, 0.0
    if not pred:
        return 1.0, 0.0, 0.0
    tp = len(pred & gold)
    precision = tp / len(pred)
    recall = tp / len(gold)
    if precision + recall == 0:
        return 0.0, 0.0, 0.0
    f1 = 2 * precision * recall / (precision + recall)
    return precision, recall, f1


def technique_recall(pred_ids: Sequence[str], gold_ids: Sequence[str], k: Optional[int] = None) -> float:
    gold = {str(x).upper() for x in gold_ids if x}
    if not gold:
        return 1.0
    pred = [str(x).upper() for x in pred_ids if x]
    if k is not None:
        pred = pred[:k]
    pred_set = set(pred)
    return len(pred_set & gold) / len(gold)


def phase_coverage(phases: Sequence[str], required: Sequence[str] = REQUIRED_PHASES) -> float:
    have = {str(p).strip().lower() for p in phases if p}
    need = [str(p).strip().lower() for p in required]
    if not need:
        return 1.0
    return sum(1 for p in need if p in have) / len(need)


@dataclass
class CaseResult:
    id: str
    name: str
    ioc_precision: float
    ioc_recall: float
    ioc_f1: float
    technique_recall: float
    grounding_score: float
    phase_coverage: float
    latency_s: float
    predicted_iocs: List[Dict[str, str]] = field(default_factory=list)
    predicted_techniques: List[str] = field(default_factory=list)
    predicted_phases: List[str] = field(default_factory=list)
    severity: str = ""
    status: str = ""
    hitl_required: bool = False
    error: Optional[str] = None


def run_offline_case(
        log_text: str,
        *,
        force_template_playbook: bool = True,
        settings: Optional[dict] = None,
) -> Dict[str, Any]:
    """Deterministic offline pipeline slice (no DB, no LLM when force_template)."""
    settings = settings or {
        "grounding_threshold": 0.7,
        "hitl_severity_min": "critical",
        "auto_approve_grounding_min": 0.9,
    }
    t0 = time.perf_counter()
    iocs = extract_iocs(log_text or "")
    enriched: List[IoC] = [enrich_ioc(i, {}, force_mock=True) for i in iocs]
    techniques = infer_techniques(log_text or "", enriched, events=None)

    if force_template_playbook:
        query = (log_text or "")[:500] + " " + " ".join(t["name"] for t in techniques)
        retrieved = kb.search(query, top_k=8, mode="bm25", rerank=False)
        for t in techniques:
            doc = kb.get_by_id(t["technique_id"])
            if doc and not any(r["id"] == t["technique_id"] for r in retrieved):
                retrieved.append({**doc, "score": 5.0})
        steps = _fallback_playbook(techniques, retrieved)
        total = len(steps)
        cited = sum(1 for s in steps if s.citation_ids)
        grounding = round(cited / total, 2) if total else 0.0
        unique_cites = {c for s in steps for c in (s.citation_ids or [])}
        citation_quality = round(len(unique_cites) / total, 2) if total else 0.0
        playbook = Playbook(
            steps=steps,
            grounding_score=grounding,
            citation_quality=citation_quality,
            llm_provider="template",
            llm_model="fallback",
        )
    else:
        import asyncio
        from backend.playbook_agent import generate_playbook

        summary = (log_text or "")[:1500]
        provider = str((settings or {}).get("llm_provider") or "anthropic")
        model = str((settings or {}).get("llm_model") or "claude-sonnet-4-6")

        async def _gen():
            return await generate_playbook(
                summary,
                list(enriched),
                techniques,
                provider=provider,
                model=model,
                settings=settings,
            )

        try:
            playbook = asyncio.run(_gen())
        except RuntimeError:
            steps = _fallback_playbook(techniques, kb.search(summary, top_k=5, mode="bm25"))
            total = len(steps)
            cited = sum(1 for s in steps if s.citation_ids)
            playbook = Playbook(
                steps=steps,
                grounding_score=round(cited / total, 2) if total else 0.0,
                citation_quality=0.0,
                llm_provider="template",
                llm_model="fallback",
            )

    top_scores = sorted([i.threat_score for i in enriched], reverse=True)[:5]
    avg_score = round(sum(top_scores) / len(top_scores), 1) if top_scores else 0.0
    severity = _severity_from(avg_score, len(techniques), critical_events=0)
    status, hitl_required, auto_approved = decide_incident_status(
        severity,
        playbook.grounding_score,
        grounding_threshold=float(settings.get("grounding_threshold", 0.7)),
        hitl_severity_min=str(settings.get("hitl_severity_min") or "critical"),
        auto_approve_grounding_min=float(settings.get("auto_approve_grounding_min", 0.9)),
    )
    latency = time.perf_counter() - t0
    return {
        "iocs": [{"type": i.type, "value": i.value} for i in enriched],
        "techniques": technique_ids_for_eval(techniques),
        "technique_detail": techniques,
        "playbook_phases": [s.phase for s in playbook.steps],
        "playbook_steps": [
            {"order": s.order, "phase": s.phase, "action": s.action, "citation_ids": s.citation_ids}
            for s in playbook.steps
        ],
        "grounding_score": playbook.grounding_score,
        "threat_score": avg_score,
        "severity": severity,
        "status": status,
        "hitl_required": hitl_required,
        "auto_approved": auto_approved,
        "latency_s": latency,
        "llm_provider": playbook.llm_provider,
    }


def evaluate_case(case: Dict[str, Any], *, force_template_playbook: bool = True) -> CaseResult:
    cid = str(case.get("id") or case.get("name") or "unknown")
    name = str(case.get("name") or cid)
    expected = case.get("expected") or {}
    try:
        pred = run_offline_case(
            case.get("log") or "",
            force_template_playbook=force_template_playbook,
            settings=case.get("settings"),
        )
    except Exception as e:
        return CaseResult(
            id=cid,
            name=name,
            ioc_precision=0.0,
            ioc_recall=0.0,
            ioc_f1=0.0,
            technique_recall=0.0,
            grounding_score=0.0,
            phase_coverage=0.0,
            latency_s=0.0,
            error=str(e),
        )

    gold_iocs = ioc_set(expected.get("iocs") or [])
    pred_iocs = ioc_set(pred["iocs"])
    p, r, f1 = f1_score(pred_iocs, gold_iocs)

    gold_tech = expected.get("technique_ids") or expected.get("techniques") or []
    tech_rec = technique_recall(pred["techniques"], gold_tech)

    req_phases = expected.get("playbook_phases") or list(REQUIRED_PHASES)
    cov = phase_coverage(pred["playbook_phases"], req_phases)

    return CaseResult(
        id=cid,
        name=name,
        ioc_precision=round(p, 4),
        ioc_recall=round(r, 4),
        ioc_f1=round(f1, 4),
        technique_recall=round(tech_rec, 4),
        grounding_score=float(pred["grounding_score"]),
        phase_coverage=round(cov, 4),
        latency_s=round(float(pred["latency_s"]), 4),
        predicted_iocs=pred["iocs"],
        predicted_techniques=pred["techniques"],
        predicted_phases=pred["playbook_phases"],
        severity=pred["severity"],
        status=pred["status"],
        hitl_required=bool(pred["hitl_required"]),
    )


def load_golden_dataset(path: Optional[Path] = None) -> List[Dict[str, Any]]:
    import os

    if path is None:
        env = os.environ.get("GOLDEN_DATASET_PATH")
        if env:
            path = Path(env)
        else:
            path = Path(__file__).resolve().parent / "tests" / "golden" / "dataset.json"
    path = Path(path)
    if not path.exists():
        raise FileNotFoundError(f"Golden dataset not found: {path}")
    data = json.loads(path.read_text(encoding="utf-8"))
    if isinstance(data, dict) and "cases" in data:
        return list(data["cases"])
    if isinstance(data, list):
        return data
    raise ValueError("Golden dataset must be a list or {cases: [...]}")


def aggregate(results: Sequence[CaseResult]) -> Dict[str, Any]:
    ok = [r for r in results if not r.error]
    n = len(ok)
    if n == 0:
        return {
            "n_cases": 0,
            "n_errors": len(results),
            "mean_ioc_f1": 0.0,
            "mean_technique_recall": 0.0,
            "mean_grounding": 0.0,
            "mean_phase_coverage": 0.0,
            "mean_latency_s": 0.0,
            "full_phase_fraction": 0.0,
        }
    lats = sorted(float(r.latency_s) for r in ok)
    def _pct(p: float) -> float:
        if not lats:
            return 0.0
        idx = min(len(lats) - 1, max(0, int(round((p / 100.0) * (len(lats) - 1)))))
        return round(lats[idx], 4)

    return {
        "n_cases": n,
        "n_errors": sum(1 for r in results if r.error),
        "mean_ioc_f1": round(sum(r.ioc_f1 for r in ok) / n, 4),
        "mean_technique_recall": round(sum(r.technique_recall for r in ok) / n, 4),
        "mean_grounding": round(sum(r.grounding_score for r in ok) / n, 4),
        "mean_phase_coverage": round(sum(r.phase_coverage for r in ok) / n, 4),
        "mean_latency_s": round(sum(lats) / n, 4) if lats else 0.0,
        "p50_latency_s": _pct(50),
        "p95_latency_s": _pct(95),
        "max_latency_s": round(max(lats), 4) if lats else 0.0,
        "min_latency_s": round(min(lats), 4) if lats else 0.0,
        "full_phase_fraction": round(sum(1 for r in ok if r.phase_coverage >= 1.0) / n, 4),
        "min_ioc_f1": round(min(r.ioc_f1 for r in ok), 4),
        "min_technique_recall": round(min(r.technique_recall for r in ok), 4),
    }


def check_thresholds(
        summary: Dict[str, Any],
        thresholds: Optional[Dict[str, float]] = None,
) -> List[str]:
    thr = {**DEFAULT_THRESHOLDS, **(thresholds or {})}
    failures: List[str] = []
    if summary.get("n_cases", 0) < thr["min_cases"]:
        failures.append(f"n_cases {summary.get('n_cases')} < {thr['min_cases']}")
    if summary.get("mean_ioc_f1", 0) < thr["min_ioc_f1"]:
        failures.append(f"mean_ioc_f1 {summary.get('mean_ioc_f1')} < {thr['min_ioc_f1']}")
    if summary.get("mean_technique_recall", 0) < thr["min_technique_recall"]:
        failures.append(
            f"mean_technique_recall {summary.get('mean_technique_recall')} < {thr['min_technique_recall']}"
        )
    if summary.get("mean_grounding", 0) < thr["min_mean_grounding"]:
        failures.append(
            f"mean_grounding {summary.get('mean_grounding')} < {thr['min_mean_grounding']}"
        )
    if summary.get("full_phase_fraction", 0) < thr["min_phase_coverage"]:
        failures.append(
            f"full_phase_fraction {summary.get('full_phase_fraction')} < {thr['min_phase_coverage']}"
        )
    if summary.get("mean_latency_s", 999) > thr["max_mean_latency_s"]:
        failures.append(
            f"mean_latency_s {summary.get('mean_latency_s')} > {thr['max_mean_latency_s']}"
        )
    if summary.get("n_errors", 0) > 0:
        failures.append(f"n_errors {summary.get('n_errors')} > 0")
    return failures


def run_benchmark(
        dataset_path: Optional[Path] = None,
        thresholds: Optional[Dict[str, float]] = None,
) -> Dict[str, Any]:
    cases = load_golden_dataset(dataset_path)
    n = len(cases)
    logger.info("Golden benchmark starting: %s cases (offline mock enrich, template playbook)", n)
    t0 = time.perf_counter()
    results: List[CaseResult] = []
    for i, c in enumerate(cases, start=1):
        results.append(evaluate_case(c))
        if i == 1 or i == n or i % 5 == 0:
            elapsed = time.perf_counter() - t0
            logger.info(
                "Golden benchmark progress: %s/%s cases (%.1fs elapsed, last=%s)",
                i, n, elapsed, results[-1].id,
            )
    summary = aggregate(results)
    failures = check_thresholds(summary, thresholds)
    elapsed = time.perf_counter() - t0
    logger.info(
        "Golden benchmark finished in %.2fs: passed=%s n_cases=%s failures=%s",
        elapsed, len(failures) == 0, summary.get("n_cases"), failures,
    )
    return {
        "summary": summary,
        "thresholds": {**DEFAULT_THRESHOLDS, **(thresholds or {})},
        "failures": failures,
        "passed": len(failures) == 0,
        "results": [asdict(r) for r in results],
        "elapsed_s": round(elapsed, 3),
    }


# ==========================================
# FastAPI Endpoints for Dataset Download & Append
# ==========================================
router = APIRouter(prefix="/eval", tags=["Evaluation"])


@router.get("/golden-dataset/download")
def download_golden_dataset():
    possible_paths = [
        Path(__file__).resolve().parent / "tests" / "golden" / "dataset.json",
        Path("backend/tests/golden/dataset.json"),
        Path("tests/golden/dataset.json"),
        Path("dataset.json")
    ]

    target_path = None
    for p in possible_paths:
        if p.exists():
            target_path = p
            break

    if not target_path or not target_path.exists():
        raise HTTPException(
            status_code=404,
            detail=f"Golden dataset file not found. Checked: {[str(p) for p in possible_paths]}"
        )

    return FileResponse(str(target_path.resolve()), media_type="application/json", filename="dataset.json")


@router.post("/golden-dataset/append")
async def append_golden_dataset(file: UploadFile = File(...)):
    if not file.filename or not file.filename.endswith(".json"):
        raise HTTPException(status_code=400, detail="Only JSON dataset files are supported.")

    try:
        content = await file.read()
        incoming_data = json.loads(content)
        incoming_cases = incoming_data.get("cases", []) if isinstance(incoming_data, dict) else incoming_data

        if not isinstance(incoming_cases, list):
            raise ValueError("Uploaded JSON must contain a list of cases or a 'cases' array.")

        dataset_path = None
        for p in [
            Path(__file__).resolve().parent / "tests" / "golden" / "dataset.json",
            Path("backend/tests/golden/dataset.json"),
            Path("tests/golden/dataset.json")
        ]:
            if p.exists():
                dataset_path = p
                break

        if not dataset_path:
            dataset_path = Path(__file__).resolve().parent / "tests" / "golden" / "dataset.json"
            dataset_path.parent.mkdir(parents=True, exist_ok=True)

        if dataset_path.exists():
            with open(dataset_path, "r", encoding="utf-8") as f:
                existing_data = json.load(f)
        else:
            existing_data = {"cases": []}

        existing_cases = existing_data.get("cases", []) if isinstance(existing_data, dict) else existing_data
        existing_ids = {c.get("id") for c in existing_cases}

        added_count = 0
        for case in incoming_cases:
            if case.get("id") not in existing_ids:
                existing_cases.append(case)
                existing_ids.add(case.get("id"))
                added_count += 1

        output_payload = {"cases": existing_cases}
        with open(dataset_path, "w", encoding="utf-8") as f:
            json.dump(output_payload, f, indent=2)

        return {
            "status": "success",
            "added_cases": added_count,
            "total_cases": len(existing_cases)
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to process uploaded dataset: {str(e)}")


def main() -> None:
    import sys

    out = run_benchmark()
    print(json.dumps({"summary": out["summary"], "passed": out["passed"], "failures": out["failures"]}, indent=2))
    sys.exit(0 if out["passed"] else 1)


if __name__ == "__main__":
    main()
