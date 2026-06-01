"""
Central Dataset Registry — singleton that holds all uploaded DataFrames.
All engines access datasets through this registry.
No CSV reloading per request.
"""
from __future__ import annotations

import time
from typing import Dict, Optional
import pandas as pd
from app.utils.logger import get_logger
from app.utils.column_mapper import find_column

logger = get_logger("dataset_registry")


class DatasetRegistry:
    """In-memory store for the three uploaded datasets."""

    def __init__(self) -> None:
        self._blackbox: Optional[pd.DataFrame] = None
        self._magnet: Optional[pd.DataFrame] = None
        self._keyword_classification: Optional[pd.DataFrame] = None

        # Metadata format: {"blackbox": {"rows": 100, "columns": [...], "timestamp": 12345, "sample": "Title"}}
        self._meta: Dict[str, Dict] = {
            "blackbox": {"rows": 0, "columns": []},
            "magnet": {"rows": 0, "columns": []},
            "keyword_classification": {"rows": 0, "columns": []},
        }

    # ------------------------------------------------------------------
    # Setters
    # ------------------------------------------------------------------

    def set_blackbox(self, df: pd.DataFrame) -> None:
        self._blackbox = df.copy()
        
        sample_title = ""
        title_col = find_column(self._blackbox, ["Title", "Product Title"])
        if title_col and len(self._blackbox) > 0:
            sample_title = str(self._blackbox[title_col].iloc[0])

        self._meta["blackbox"] = {
            "rows": len(df),
            "columns": list(df.columns),
            "timestamp": int(time.time()),
            "sample_title": sample_title,
        }
        logger.info(f"BlackBox stored: {len(df)} rows, {len(df.columns)} cols")

    def set_magnet(self, df: pd.DataFrame) -> None:
        self._magnet = df.copy()
        
        sample_kw = ""
        kw_col = find_column(self._magnet, ["Keyword Phrase", "Keyword"])
        if kw_col and len(self._magnet) > 0:
            sample_kw = str(self._magnet[kw_col].iloc[0])

        self._meta["magnet"] = {
            "rows": len(df),
            "columns": list(df.columns),
            "timestamp": int(time.time()),
            "sample_keyword": sample_kw,
        }
        logger.info(f"Magnet stored: {len(df)} rows, {len(df.columns)} cols")

    def set_keyword_classification(self, df: pd.DataFrame) -> None:
        self._keyword_classification = df.copy()
        self._meta["keyword_classification"] = {
            "rows": len(df),
            "columns": list(df.columns),
            "timestamp": int(time.time()),
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
