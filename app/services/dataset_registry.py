"""
Central Dataset Registry — singleton that holds all uploaded DataFrames.
All engines access datasets through this registry.
No CSV reloading per request.
"""
from __future__ import annotations

from typing import Dict, Optional

import pandas as pd

from app.utils.logger import get_logger

logger = get_logger("dataset_registry")


class DatasetRegistry:
    """In-memory store for the three uploaded datasets."""

    def __init__(self) -> None:
        self._blackbox: Optional[pd.DataFrame] = None
        self._magnet: Optional[pd.DataFrame] = None
        self._keyword_classification: Optional[pd.DataFrame] = None
        self._meta: Dict[str, Dict] = {}

    # ------------------------------------------------------------------
    # Setters
    # ------------------------------------------------------------------

    def set_blackbox(self, df: pd.DataFrame) -> None:
        self._blackbox = df.copy()
        self._meta["blackbox"] = {
            "rows": len(df),
            "columns": list(df.columns),
        }
        logger.info(f"BlackBox stored: {len(df)} rows, {len(df.columns)} cols")

    def set_magnet(self, df: pd.DataFrame) -> None:
        self._magnet = df.copy()
        self._meta["magnet"] = {
            "rows": len(df),
            "columns": list(df.columns),
        }
        logger.info(f"Magnet stored: {len(df)} rows, {len(df.columns)} cols")

    def set_keyword_classification(self, df: pd.DataFrame) -> None:
        self._keyword_classification = df.copy()
        self._meta["keyword_classification"] = {
            "rows": len(df),
            "columns": list(df.columns),
        }
        logger.info(
            f"Keyword Classification stored: {len(df)} rows, {len(df.columns)} cols"
        )

    # ------------------------------------------------------------------
    # Getters
    # ------------------------------------------------------------------

    def get_blackbox(self) -> Optional[pd.DataFrame]:
        return self._blackbox

    def get_magnet(self) -> Optional[pd.DataFrame]:
        return self._magnet

    def get_keyword_classification(self) -> Optional[pd.DataFrame]:
        return self._keyword_classification

    # ------------------------------------------------------------------
    # Status helpers
    # ------------------------------------------------------------------

    def is_blackbox_loaded(self) -> bool:
        return self._blackbox is not None and not self._blackbox.empty

    def is_magnet_loaded(self) -> bool:
        return self._magnet is not None and not self._magnet.empty

    def is_keyword_classification_loaded(self) -> bool:
        return (
            self._keyword_classification is not None
            and not self._keyword_classification.empty
        )

    def get_status(self) -> Dict[str, bool]:
        return {
            "blackbox": self.is_blackbox_loaded(),
            "magnet": self.is_magnet_loaded(),
            "keyword_classification": self.is_keyword_classification_loaded(),
        }

    def get_meta(self) -> Dict:
        return self._meta

    def rows_loaded(self) -> Dict[str, int]:
        return {k: v["rows"] for k, v in self._meta.items()}


# Global singleton — imported by all engines and routes
registry = DatasetRegistry()
