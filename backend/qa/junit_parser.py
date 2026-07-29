"""JUnit XML parser (pytest / xunit) using defusedxml.

Returns suite summary + per-case rows ready for ``qa_suite_runs`` / ``qa_case_results``.
"""
from __future__ import annotations

import hashlib
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional, Union

from defusedxml import ElementTree as ET

from backend.qa.limits import (
    MAX_CASE_RESULTS,
    MAX_FAILURES_SAMPLE,
    MAX_MESSAGE_CHARS,
    MAX_SYSTEM_OUT_CHARS,
    MAX_XML_BYTES,
)
from backend.qa.module_map import MODULE_MAP_VERSION, map_junit_nodeid


class JUnitParseError(ValueError):
    """Invalid or unsafe JUnit XML."""


@dataclass
class JUnitCase:
    nodeid: str
    name: str
    classname: str
    status: str  # passed | failed | skipped | error
    duration_s: float
    message: str
    system_out: Optional[str]
    module: str

    def to_dict(self) -> Dict[str, Any]:
        return {
            "nodeid": self.nodeid,
            "name": self.name,
            "classname": self.classname,
            "status": self.status,
            "duration_s": self.duration_s,
            "message": self.message,
            "system_out": self.system_out,
            "module": self.module,
        }


@dataclass
class JUnitParseResult:
    counts: Dict[str, int]
    duration_s: float
    cases: List[JUnitCase] = field(default_factory=list)
    failures_sample: List[Dict[str, str]] = field(default_factory=list)
    warnings: List[str] = field(default_factory=list)
    sha256: str = ""
    bytes: int = 0
    module_map_version: str = MODULE_MAP_VERSION

    def to_summary(self) -> Dict[str, Any]:
        status = "passed"
        if self.counts.get("errors", 0) or self.counts.get("failed", 0):
            status = "failed"
        elif self.counts.get("total", 0) == 0:
            status = "error"
        return {
            "status": status,
            "counts": dict(self.counts),
            "duration_s": self.duration_s,
            "failures_sample": list(self.failures_sample),
            "case_count_stored": len(self.cases),
            "warnings": list(self.warnings),
            "sha256": self.sha256,
            "bytes": self.bytes,
            "module_map_version": self.module_map_version,
        }


def _trunc(s: Optional[str], n: int) -> str:
    if not s:
        return ""
    s = str(s)
    if len(s) <= n:
        return s
    return s[: n - 1] + "…"


def _attr_float(el, name: str, default: float = 0.0) -> float:
    raw = el.attrib.get(name)
    if raw is None or raw == "":
        return default
    try:
        return float(raw)
    except (TypeError, ValueError):
        return default


def _attr_int(el, name: str, default: int = 0) -> int:
    raw = el.attrib.get(name)
    if raw is None or raw == "":
        return default
    try:
        return int(float(raw))
    except (TypeError, ValueError):
        return default


def _case_status(tc) -> tuple[str, str]:
    """Return (status, message) from a testcase element."""
    for tag, status in (("error", "error"), ("failure", "failed"), ("skipped", "skipped")):
        child = tc.find(tag)
        if child is not None:
            msg = child.attrib.get("message") or (child.text or "") or status
            return status, _trunc(msg, MAX_MESSAGE_CHARS)
    return "passed", ""


def _system_out(tc) -> Optional[str]:
    for tag in ("system-out", "system-err"):
        child = tc.find(tag)
        if child is not None and (child.text or "").strip():
            return _trunc(child.text, MAX_SYSTEM_OUT_CHARS)
    return None


def _nodeid(classname: str, name: str) -> str:
    cn = (classname or "").strip()
    nm = (name or "").strip()
    if cn and nm:
        # pytest style: package.module.Class::test or file path
        if "/" in cn or cn.endswith(".py"):
            return f"{cn}::{nm}"
        return f"{cn}::{nm}"
    return nm or cn or "unknown"


def parse_junit_xml(data: Union[bytes, str], *, max_cases: int = MAX_CASE_RESULTS) -> JUnitParseResult:
    """Parse JUnit XML bytes/string into structured result."""
    if isinstance(data, str):
        raw = data.encode("utf-8", errors="replace")
    else:
        raw = data
    if len(raw) > MAX_XML_BYTES:
        raise JUnitParseError(f"JUnit XML exceeds max size ({MAX_XML_BYTES} bytes)")
    if not raw.strip():
        raise JUnitParseError("Empty JUnit XML")

    sha = hashlib.sha256(raw).hexdigest()
    try:
        root = ET.fromstring(raw)
    except ET.ParseError as e:
        raise JUnitParseError(f"Invalid JUnit XML: {e}") from e
    except Exception as e:
        # defusedxml raises DefusedXmlException subclasses for XXE etc.
        raise JUnitParseError(f"Rejected or invalid XML: {e}") from e

    tag = root.tag.split("}")[-1] if "}" in root.tag else root.tag
    if tag not in ("testsuites", "testsuite"):
        raise JUnitParseError(f"Unexpected root element: {root.tag}")

    cases: List[JUnitCase] = []
    failures_sample: List[Dict[str, str]] = []
    warnings: List[str] = []
    total = passed = failed = skipped = errors = 0
    duration = 0.0
    stored = 0

    suites = [root] if tag == "testsuite" else list(root.findall("testsuite"))
    if tag == "testsuites" and not suites:
        # some exporters put testcases directly under testsuites
        suites = [root]

    for suite in suites:
        duration += _attr_float(suite, "time", 0.0)
        # Prefer summing cases; suite attrs are fallback if no cases
        suite_cases = suite.findall("testcase")
        if not suite_cases and suite is root and tag == "testsuites":
            continue
        for tc in suite_cases:
            name = tc.attrib.get("name") or "unnamed"
            classname = tc.attrib.get("classname") or ""
            file_path = tc.attrib.get("file") or ""
            status, message = _case_status(tc)
            dur = _attr_float(tc, "time", 0.0)
            nodeid = _nodeid(classname, name)
            module = map_junit_nodeid(nodeid, classname=classname, file_path=file_path)

            total += 1
            if status == "passed":
                passed += 1
            elif status == "failed":
                failed += 1
            elif status == "skipped":
                skipped += 1
            else:
                errors += 1

            if status in ("failed", "error") and len(failures_sample) < MAX_FAILURES_SAMPLE:
                failures_sample.append(
                    {
                        "name": name,
                        "classname": classname,
                        "message": message,
                        "nodeid": nodeid,
                    }
                )

            if stored < max_cases:
                cases.append(
                    JUnitCase(
                        nodeid=nodeid,
                        name=name,
                        classname=classname,
                        status=status,
                        duration_s=dur,
                        message=message,
                        system_out=_system_out(tc),
                        module=module,
                    )
                )
                stored += 1

    if total == 0 and tag == "testsuite":
        # Empty suite with counts on attributes
        total = _attr_int(root, "tests", 0)
        failed = _attr_int(root, "failures", 0)
        errors = _attr_int(root, "errors", 0)
        skipped = _attr_int(root, "skipped", 0)
        passed = max(0, total - failed - errors - skipped)
        if duration == 0:
            duration = _attr_float(root, "time", 0.0)

    if stored >= max_cases and total > max_cases:
        warnings.append(f"case_results_truncated:{max_cases}_of_{total}")

    if duration == 0.0 and cases:
        duration = sum(c.duration_s for c in cases)

    return JUnitParseResult(
        counts={
            "total": total,
            "passed": passed,
            "failed": failed,
            "skipped": skipped,
            "blocked": 0,
            "errors": errors,
        },
        duration_s=round(duration, 4),
        cases=cases,
        failures_sample=failures_sample,
        warnings=warnings,
        sha256=sha,
        bytes=len(raw),
    )
