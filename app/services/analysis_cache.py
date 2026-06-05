"""
Single source of truth for analysis outputs.

Market report and UI read from the same cached engine results.
Supports incremental caching — engines are cached as they complete,
so the frontend can start displaying results before the full run finishes.
"""
from __future__ import annotations

import time
import threading
from typing import Any, Dict, Optional

from app.utils.logger import get_logger

logger = get_logger("analysis_cache")


class AnalysisCache:
    """In-memory cache of last full analysis run with incremental support."""

    def __init__(self) -> None:
        self._snapshot: Optional[Dict[str, Any]] = None
        self._timestamp: float = 0.0
        self._processing: bool = False
        self._engines_completed: int = 0
        self._engines_total: int = 0
        self._lock = threading.Lock()

    def set_snapshot(self, snapshot: Dict[str, Any]) -> None:
        with self._lock:
            self._snapshot = snapshot
            self._timestamp = time.time()
            self._processing = False
            self._engines_completed = len(snapshot.get("engines", {}))
            self._engines_total = self._engines_completed
        logger.info("Analysis snapshot cached with %s engine outputs", len(snapshot.get("engines", {})))

    def get_snapshot(self) -> Optional[Dict[str, Any]]:
        with self._lock:
            return self._snapshot

    def get_engine(self, name: str, scope_key: str = "all") -> Optional[Dict[str, Any]]:
        with self._lock:
            if not self._snapshot:
                return None
            key = f"{name}_{scope_key}"
            return self._snapshot.get("engines", {}).get(key)

    def set_engine(self, name: str, result: Dict[str, Any], scope_key: str = "all") -> None:
        """Cache a single engine result incrementally."""
        with self._lock:
            if not self._snapshot:
                self._snapshot = {"engines": {}, "top_n": 10}
                self._timestamp = time.time()
            key = f"{name}_{scope_key}"
            self._snapshot.setdefault("engines", {})[key] = result
            self._engines_completed += 1

    def set_processing(self, total_engines: int) -> None:
        """Mark that a background analysis run is in progress."""
        with self._lock:
            self._processing = True
            self._engines_total = total_engines
            self._engines_completed = 0

    def get_status(self) -> Dict[str, Any]:
        """Return processing status for the frontend."""
        with self._lock:
            return {
                "processing": self._processing,
                "engines_completed": self._engines_completed,
                "engines_total": self._engines_total,
                "has_results": self._snapshot is not None,
                "last_updated": self._timestamp,
            }

    def clear(self) -> None:
        with self._lock:
            self._snapshot = None
            self._timestamp = 0.0
            self._processing = False
            self._engines_completed = 0
            self._engines_total = 0


analysis_cache = AnalysisCache()
