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
from app.services.search_volume_aggregator import search_volume_aggregator

logger = get_logger("dataset_registry")


class DatasetRegistry:
    """In-memory store for the three uploaded datasets."""

    def __init__(self) -> None:
        self._blackbox: Optional[pd.DataFrame] = None
        self._original_blackbox: Optional[pd.DataFrame] = None
        self._magnet: Optional[pd.DataFrame] = None
        self._keyword_classification: Optional[pd.DataFrame] = None
        self._selected_category_column: str = ""
        self._selected_categories: list[str] = []

        # Metadata format: {"blackbox": {"rows": 100, "columns": [...], "timestamp": 12345, "sample": "Title"}}
        self._meta: Dict[str, Dict] = {
            "blackbox": {
                "rows": 0, 
                "columns": [], 
                "original_rows": 0,
                "filtered_rows": 0,
                "excluded_rows": 0,
                "selected_category_column": "",
                "selected_categories": []
            },
            "magnet": {"rows": 0, "columns": []},
            "keyword_classification": {"rows": 0, "columns": []},
        }

    # ------------------------------------------------------------------
    # Setters
    # ------------------------------------------------------------------

    def set_blackbox(self, df: pd.DataFrame) -> None:
        self._original_blackbox = df.copy()
        self._blackbox = df.copy()
        self._selected_category_column = ""
        self._selected_categories = []
        
        sample_title = ""
        title_col = find_column(self._blackbox, ["Title", "Product Title"])
        if title_col and len(self._blackbox) > 0:
            sample_title = str(self._blackbox[title_col].iloc[0])

        self._meta["blackbox"] = {
            "rows": len(df),
            "original_rows": len(df),
            "filtered_rows": len(df),
            "excluded_rows": 0,
            "columns": list(df.columns),
            "timestamp": int(time.time()),
            "sample_title": sample_title,
            "selected_category_column": "",
            "selected_categories": [],
        }
        logger.info(f"BlackBox stored: {len(df)} rows, {len(df.columns)} cols")

    def set_magnet(self, df: pd.DataFrame) -> None:
        search_volume_aggregator.clear()
        # Apply global search volume aggregation
        df = search_volume_aggregator.apply_global_aggregation(df)
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
    # Category Filtering
    # ------------------------------------------------------------------
    
    def get_detected_categories(self) -> dict:
        if self._original_blackbox is None or self._original_blackbox.empty:
            return {"status": "error", "message": "No BlackBox dataset loaded."}
            
        df = self._original_blackbox
        
        # Determine best category column
        cat_candidates = [
            "Category Path", "Full Category Path", "Category", 
            "Main Category", "Root Category", "Subcategory", "Product Type"
        ]
        cat_col = find_column(df, cat_candidates)
        
        if not cat_col:
            return {
                "status": "success",
                "has_categories": False,
                "column": None,
                "categories": []
            }
            
        # Group and count
        rev_col = find_column(df, ["Parent Level Revenue", "Revenue", "Monthly Revenue"])
        sales_col = find_column(df, ["Parent Level Sales", "Sales", "Monthly Sales", "Units"])
        
        # Fill NaN categories with "Uncategorized"
        cat_s = df[cat_col].fillna("Uncategorized")
        
        results = []
        unique_cats = cat_s.unique()
        
        for c in unique_cats:
            mask = cat_s == c
            sub_df = df[mask]
            
            # get 3 sample products
            title_col = find_column(sub_df, ["Title", "Product Title"])
            samples = []
            if title_col:
                samples = sub_df[title_col].dropna().head(3).tolist()
                
            rev = float(sub_df[rev_col].sum()) if rev_col else 0.0
            units = int(sub_df[sales_col].sum()) if sales_col else 0
            
            results.append({
                "category": str(c),
                "product_count": len(sub_df),
                "revenue": rev,
                "units_sold": units,
                "sample_products": samples
            })
            
        # Sort by product count descending
        results.sort(key=lambda x: x["product_count"], reverse=True)
        
        return {
            "status": "success",
            "has_categories": True,
            "column": cat_col,
            "categories": results
        }
        
    def set_category(self, categories: list[str]) -> dict:
        if self._original_blackbox is None or self._original_blackbox.empty:
            return {"status": "error", "message": "No BlackBox dataset loaded."}
            
        cat_info = self.get_detected_categories()
        if not cat_info.get("has_categories"):
            return {"status": "error", "message": "No category column available."}
            
        cat_col = cat_info["column"]
        self._selected_category_column = cat_col
        self._selected_categories = categories
        
        df = self._original_blackbox
        cat_s = df[cat_col].fillna("Uncategorized")
        
        # Filter
        mask = cat_s.isin(categories)
        filtered_df = df[mask]
        
        self._blackbox = filtered_df.copy()
        
        # Update meta
        orig_len = len(df)
        filt_len = len(filtered_df)
        self._meta["blackbox"]["rows"] = filt_len
        self._meta["blackbox"]["filtered_rows"] = filt_len
        self._meta["blackbox"]["excluded_rows"] = orig_len - filt_len
        self._meta["blackbox"]["selected_category_column"] = cat_col
        self._meta["blackbox"]["selected_categories"] = categories
        
        logger.info(f"Filtered BlackBox to categories: {categories}. Rows: {filt_len} (Excluded: {orig_len - filt_len})")
        
        return {
            "status": "success",
            "message": f"Category set to {categories}",
            "filtered_rows": filt_len,
            "excluded_rows": orig_len - filt_len
        }

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
