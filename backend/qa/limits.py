"""Shared size / truncation limits for QA artifact parsing."""
from __future__ import annotations

# Max upload / parse size for a single XML artifact (bytes)
MAX_XML_BYTES = 20 * 1024 * 1024  # 20 MB

# Truncate failure messages / system-out
MAX_MESSAGE_CHARS = 2048
MAX_SYSTEM_OUT_CHARS = 4096

# Cap case rows stored from a single JUnit (full counts still computed)
MAX_CASE_RESULTS = 5000
MAX_FAILURES_SAMPLE = 50
