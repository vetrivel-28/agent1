"""
Single source of truth for analysis outputs.

Market report and UI read from the same cached engine results.
"""
from __future__ import annotations

import time
from typing import Any, Dict, Optional

from app.utils.logger import get_logger

logger = get_logger("analysis_cache")


class AnalysisCache:
    """In-memory cache of last full analysis run."""

    def __init__(self) -> None:
        self._snapshot: Optional[Dict[str, Any]] = None
        self._timestamp: float = 0.0

    def set_snapshot(self, snapshot: Dict[str, Any]) -> None:
        self._snapshot = snapshot
        self._timestamp = time.time()
        logger.info("Analysis snapshot cached with %s engine outputs", len(snapshot.get("engines", {})))

    def get_snapshot(self) -> Optional[Dict[str, Any]]:
        return self._snapshot

    def get_engine(self, name: str) -> Optional[Dict[str, Any]]:
        if not self._snapshot:
            return None
        return self._snapshot.get("engines", {}).get(name)

    def clear(self) -> None:
        self._snapshot = None
        self._timestamp = 0.0


analysis_cache = AnalysisCache()
