"""Cobertura coverage.xml parser (pytest-cov / coverage.py) via defusedxml.

Product READY gate uses root ``line-rate`` percent (see design §9.5).
"""
from __future__ import annotations

import hashlib
import os
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional, Union

from defusedxml import ElementTree as ET

from backend.qa.limits import MAX_XML_BYTES

DEFAULT_GATE_PERCENT = 96.0


class CoverageParseError(ValueError):
    """Invalid or unsafe coverage XML."""


@dataclass
class CoverageParseResult:
    line_rate: float
    branch_rate: float
    lines_valid: int
    lines_covered: int
    branches_valid: int
    branches_covered: int
    percent: float
    gap_to_gate: float
    gate_passed: bool
    gate_percent: float
    packages: List[Dict[str, Any]] = field(default_factory=list)
    path_normalization: str = "backend_prefix"
    warnings: List[str] = field(default_factory=list)
    sha256: str = ""
    bytes: int = 0

    def to_backend_block(self) -> Dict[str, Any]:
        return {
            "line_rate": self.line_rate,
            "branch_rate": self.branch_rate,
            "lines_valid": self.lines_valid,
            "lines_covered": self.lines_covered,
            "branches_valid": self.branches_valid,
            "branches_covered": self.branches_covered,
            "percent": self.percent,
            "gap_to_gate": self.gap_to_gate,
            "gate_passed": self.gate_passed,
        }

    def to_snapshot_fields(self) -> Dict[str, Any]:
        return {
            "gate_percent": self.gate_percent,
            "gate_metric": "cobertura_line_rate",
            "backend": self.to_backend_block(),
            "frontend": {
                "available": False,
                "line_rate": None,
                "branch_rate": None,
                "percent": None,
                "note": "No Istanbul/nyc CI artifact ingested",
            },
            "overall": {
                "percent": self.percent,
                "composition": "backend_only",
            },
            "packages": list(self.packages),
            "path_normalization": self.path_normalization,
            "xml_sha256": self.sha256,
            "warnings": list(self.warnings),
            "bytes": self.bytes,
        }


def _f(el, name: str, default: float = 0.0) -> float:
    raw = el.attrib.get(name) if el is not None else None
    if raw is None or raw == "":
        return default
    try:
        return float(raw)
    except (TypeError, ValueError):
        return default


def _i(el, name: str, default: int = 0) -> int:
    raw = el.attrib.get(name) if el is not None else None
    if raw is None or raw == "":
        return default
    try:
        return int(float(raw))
    except (TypeError, ValueError):
        return default


def normalize_package_name(name: str) -> str:
    """Display path consistency with repo layout (cwd=backend → prefix backend/)."""
    n = (name or "").replace("\\", "/").strip()
    if not n:
        return n
    if n.startswith("backend/") or n.startswith("backend."):
        return n
    # dotted package from cobertura (e.g. pipeline or backend.pipeline)
    if "/" not in n and "." in n:
        if n.startswith("backend."):
            return n
        # leave dotted as-is but prefer backend. prefix for app packages
        return f"backend.{n}" if not n.startswith("tests") else n
    if not n.startswith("backend") and not n.startswith("tests") and not n.startswith("frontend"):
        return f"backend/{n}" if "/" in n or n.endswith(".py") else f"backend.{n}"
    return n


def parse_coverage_xml(
    data: Union[bytes, str],
    *,
    gate_percent: Optional[float] = None,
    max_packages: int = 200,
) -> CoverageParseResult:
    """Parse Cobertura coverage.xml into structured metrics."""
    if isinstance(data, str):
        raw = data.encode("utf-8", errors="replace")
    else:
        raw = data
    if len(raw) > MAX_XML_BYTES:
        raise CoverageParseError(f"coverage XML exceeds max size ({MAX_XML_BYTES} bytes)")
    if not raw.strip():
        raise CoverageParseError("Empty coverage XML")

    gate = float(gate_percent if gate_percent is not None else os.environ.get("COV_FAIL", DEFAULT_GATE_PERCENT))
    # COV_FAIL might be string
    try:
        gate = float(gate)
    except (TypeError, ValueError):
        gate = DEFAULT_GATE_PERCENT

    sha = hashlib.sha256(raw).hexdigest()
    try:
        root = ET.fromstring(raw)
    except ET.ParseError as e:
        raise CoverageParseError(f"Invalid coverage XML: {e}") from e
    except Exception as e:
        raise CoverageParseError(f"Rejected or invalid XML: {e}") from e

    tag = root.tag.split("}")[-1] if "}" in root.tag else root.tag
    if tag != "coverage":
        raise CoverageParseError(f"Unexpected root element: {root.tag} (expected coverage)")

    line_rate = _f(root, "line-rate", 0.0)
    branch_rate = _f(root, "branch-rate", 0.0)
    lines_valid = _i(root, "lines-valid", 0)
    lines_covered = _i(root, "lines-covered", 0)
    branches_valid = _i(root, "branches-valid", 0)
    branches_covered = _i(root, "branches-covered", 0)

    # Some exporters only put rates on packages — fall back
    warnings: List[str] = []
    if lines_valid == 0 and line_rate == 0.0:
        packages_el = root.find("packages")
        if packages_el is not None:
            lv = lc = 0
            for pkg in packages_el.findall("package"):
                # estimate from rate * lines if present on classes
                for cls in pkg.findall("classes/class") or pkg.findall("class"):
                    # count lines if present
                    lines_el = cls.find("lines")
                    if lines_el is not None:
                        for ln in lines_el.findall("line"):
                            lv += 1
                            if _i(ln, "hits", 0) > 0:
                                lc += 1
            if lv > 0:
                lines_valid, lines_covered = lv, lc
                line_rate = lc / lv
                warnings.append("line_rate_derived_from_classes")

    percent = round(line_rate * 100.0, 2)
    gap = round(max(0.0, gate - percent), 2)
    gate_passed = percent >= gate

    packages: List[Dict[str, Any]] = []
    packages_el = root.find("packages")
    if packages_el is not None:
        for pkg in packages_el.findall("package"):
            if len(packages) >= max_packages:
                warnings.append(f"packages_truncated:{max_packages}")
                break
            name = normalize_package_name(pkg.attrib.get("name") or "")
            packages.append(
                {
                    "name": name,
                    "line_rate": _f(pkg, "line-rate", 0.0),
                    "branch_rate": _f(pkg, "branch-rate", 0.0),
                    "lines_valid": _i(pkg, "lines-valid", 0),
                    "lines_covered": _i(pkg, "lines-covered", 0),
                }
            )

    return CoverageParseResult(
        line_rate=line_rate,
        branch_rate=branch_rate,
        lines_valid=lines_valid,
        lines_covered=lines_covered,
        branches_valid=branches_valid,
        branches_covered=branches_covered,
        percent=percent,
        gap_to_gate=gap,
        gate_passed=gate_passed,
        gate_percent=gate,
        packages=packages,
        warnings=warnings,
        sha256=sha,
        bytes=len(raw),
    )
