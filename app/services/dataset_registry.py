"""
Central Dataset Registry — singleton that holds all uploaded DataFrames.
All engines access datasets through this registry.
No CSV reloading per request.
"""
from __future__ import annotations

import time
from typing import Any, Dict, List, Optional, Tuple
import pandas as pd
from app.utils.logger import get_logger
from app.utils.column_mapper import find_column
from app.utils.numeric_cleaner import clean_numeric_series
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
        self._selected_categories: List[str] = []
        self._category_pending: bool = False
        self._use_full_blackbox: bool = False

        # Metadata format: {"blackbox": {"rows": 100, "columns": [...], "timestamp": 12345, "sample": "Title", "filename": "data.csv"}}
        self._meta: Dict[str, Dict] = {
            "blackbox": {
                "rows": 0,
                "columns": [],
                "original_rows": 0,
                "filtered_rows": 0,
                "excluded_rows": 0,
                "selected_category_column": "",
                "selected_categories": [],
                "category_selection_required": False,
                "category_selection_confirmed": False,
                "use_full_blackbox": False,
                "filename": "",
            },
            "magnet": {"rows": 0, "columns": [], "filename": ""},
            "keyword_classification": {"rows": 0, "columns": [], "filename": ""},
        }

    # ------------------------------------------------------------------
    # Setters
    # ------------------------------------------------------------------

    def set_blackbox(self, df: pd.DataFrame, filename: str = "") -> None:
        self._original_blackbox = df.copy()
        self._selected_category_column = ""
        self._selected_categories = []
        self._use_full_blackbox = True
        self._category_pending = False
        self._blackbox = df.copy()

        sample_title = ""
        title_col = find_column(df, ["Title", "Product Title"])
        if title_col and len(df) > 0:
            sample_title = str(df[title_col].iloc[0])

        cat_info = self._detect_categories_from_df(df)
        requires_selection = bool(cat_info.get("has_categories"))

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
            "category_selection_required": False,
            "category_selection_confirmed": True,
            "use_full_blackbox": True,
            "detected_category_column": cat_info.get("column"),
            "detected_category_count": len(cat_info.get("categories", [])),
            "filename": filename,
        }
        logger.info(
            "BlackBox stored: %s rows — full dataset active by default",
            len(df),
        )

    def set_magnet(self, df: pd.DataFrame, filename: str = "") -> None:
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
            "filename": filename,
        }
        logger.info(f"Magnet stored: {len(df)} rows, {len(df.columns)} cols")

    def set_keyword_classification(self, df: pd.DataFrame, filename: str = "") -> None:
        self._keyword_classification = df.copy()
        self._meta["keyword_classification"] = {
            "rows": len(df),
            "columns": list(df.columns),
            "timestamp": int(time.time()),
            "filename": filename,
        }
        logger.info(
            f"Keyword Classification stored: {len(df)} rows, {len(df.columns)} cols"
        )


    # ------------------------------------------------------------------
    # Category Filtering
    # ------------------------------------------------------------------
    
    def _detect_categories_from_df(self, df: pd.DataFrame) -> dict:
        cat_candidates = [
            "Category Path",
            "Full Category Path",
            "Marketplace Category",
            "Product Category",
            "Category",
            "Main Category",
            "Root Category",
            "Subcategory",
            "Product Type",
        ]
        cat_col = find_column(df, cat_candidates)
        if not cat_col:
            return {
                "status": "success",
                "has_categories": False,
                "column": None,
                "categories": [],
            }

        rev_col = find_column(
            df,
            ["Parent Level Revenue", "ASIN Revenue", "Revenue", "Monthly Revenue"],
        )
        sales_col = find_column(
            df,
            ["Parent Level Sales", "ASIN Sales", "Sales", "Monthly Sales", "Units"],
        )
        cat_s = df[cat_col].fillna("Uncategorized").astype(str).str.strip()
        results = []
        for c in cat_s.unique():
            mask = cat_s == c
            sub_df = df[mask]
            title_col = find_column(sub_df, ["Title", "Product Title"])
            samples = sub_df[title_col].dropna().head(3).tolist() if title_col else []
            rev = 0.0
            if rev_col:
                rev_c, _ = clean_numeric_series(sub_df[rev_col], rev_col)
                rev = float(rev_c.sum())
            units = 0
            if sales_col:
                sales_c, _ = clean_numeric_series(sub_df[sales_col], sales_col)
                units = int(sales_c.sum())
            results.append({
                "category": str(c),
                "product_count": int(len(sub_df)),
                "revenue": round(rev, 2),
                "units_sold": units,
                "sample_products": [str(s) for s in samples],
            })
        results.sort(key=lambda x: x["product_count"], reverse=True)
        return {
            "status": "success",
            "has_categories": True,
            "column": cat_col,
            "categories": results,
        }

    def get_detected_categories(self) -> dict:
        if self._original_blackbox is None or self._original_blackbox.empty:
            return {"status": "error", "message": "No BlackBox dataset loaded."}
        return self._detect_categories_from_df(self._original_blackbox)
        
    def set_category(self, categories: List[str]) -> dict:
        if self._original_blackbox is None or self._original_blackbox.empty:
            return {"status": "error", "message": "No BlackBox dataset loaded."}
        if not categories or "All Categories" in categories:
            self._blackbox = self._original_blackbox.copy()
            self._selected_categories = []
            self._selected_category_column = ""
            self._use_full_blackbox = True
            self._category_pending = False
            
            n = len(self._blackbox)
            self._meta["blackbox"]["rows"] = n
            self._meta["blackbox"]["filtered_rows"] = n
            self._meta["blackbox"]["excluded_rows"] = 0
            self._meta["blackbox"]["selected_categories"] = []
            self._meta["blackbox"]["selected_category_column"] = ""
            self._meta["blackbox"]["category_selection_confirmed"] = True
            self._meta["blackbox"]["use_full_blackbox"] = True

            logger.info("BlackBox analysis scope reset to full dataset (%s rows)", n)
            return {
                "status": "success",
                "message": "Reset to All Categories (full dataset).",
                "filtered_rows": n,
                "excluded_rows": 0,
                "original_rows": n,
                "use_full_blackbox": True,
            }

        cat_info = self.get_detected_categories()
        if not cat_info.get("has_categories"):
            return {"status": "error", "message": "No category column available."}

        cat_col = cat_info["column"]
        self._selected_category_column = cat_col
        self._selected_categories = list(categories)
        self._use_full_blackbox = False

        df = self._original_blackbox
        cat_s = df[cat_col].fillna("Uncategorized").astype(str).str.strip()
        filtered_df = df[cat_s.isin(categories)].copy()

        if filtered_df.empty:
            return {
                "status": "error",
                "message": "No products found in selected category. Please choose another category.",
            }

        self._blackbox = filtered_df
        self._category_pending = False

        orig_len = len(df)
        filt_len = len(filtered_df)
        self._meta["blackbox"]["rows"] = filt_len
        self._meta["blackbox"]["filtered_rows"] = filt_len
        self._meta["blackbox"]["excluded_rows"] = orig_len - filt_len
        self._meta["blackbox"]["selected_category_column"] = cat_col
        self._meta["blackbox"]["selected_categories"] = categories
        self._meta["blackbox"]["category_selection_confirmed"] = True
        self._meta["blackbox"]["category_selection_required"] = True
        self._meta["blackbox"]["use_full_blackbox"] = False

        logger.info(
            "Filtered BlackBox to %s — %s rows (excluded %s)",
            categories,
            filt_len,
            orig_len - filt_len,
        )
        return {
            "status": "success",
            "message": f"Category scope set to {categories}",
            "filtered_rows": filt_len,
            "excluded_rows": orig_len - filt_len,
            "original_rows": orig_len,
            "selected_category_column": cat_col,
            "selected_categories": categories,
        }

    def confirm_full_blackbox(self) -> dict:
        """Use entire BlackBox when no category column exists (user acknowledged warning)."""
        if self._original_blackbox is None or self._original_blackbox.empty:
            return {"status": "error", "message": "No BlackBox dataset loaded."}

        self._blackbox = self._original_blackbox.copy()
        self._selected_categories = []
        self._selected_category_column = ""
        self._use_full_blackbox = True
        self._category_pending = False

        n = len(self._blackbox)
        self._meta["blackbox"]["rows"] = n
        self._meta["blackbox"]["filtered_rows"] = n
        self._meta["blackbox"]["excluded_rows"] = 0
        self._meta["blackbox"]["selected_categories"] = []
        self._meta["blackbox"]["category_selection_confirmed"] = True
        self._meta["blackbox"]["use_full_blackbox"] = True

        logger.info("BlackBox analysis scope: full dataset (%s rows)", n)
        return {
            "status": "success",
            "message": "Using full BlackBox dataset (category filtering unavailable).",
            "filtered_rows": n,
            "excluded_rows": 0,
            "original_rows": n,
            "use_full_blackbox": True,
        }

    def is_blackbox_scope_ready(self) -> bool:
        if self._original_blackbox is None or self._original_blackbox.empty:
            return True
        return not self._category_pending

    def requires_category_selection(self) -> bool:
        return False

    def get_category_scope(self) -> Dict[str, Any]:
        bb = self._meta.get("blackbox", {})
        selected = bb.get("selected_categories", [])
        mode = "selected" if selected and len(selected) > 0 else "all"
        scope_key = "|".join(selected) if selected else "all"
        return {
            "mode": mode,
            "selected_categories": selected,
            "category_column": bb.get("selected_category_column") or bb.get("detected_category_column"),
            "blackbox_rows_total": bb.get("original_rows", 0),
            "blackbox_rows_active": bb.get("filtered_rows", 0),
            "blackbox_rows_excluded": bb.get("excluded_rows", 0),
            "scope_key": scope_key,
            "keyword_scope_key": f"{scope_key}_kw" if selected else "all",
        }

    def analysis_readiness(self) -> Tuple[bool, str]:
        if not self.is_blackbox_loaded() and not self.is_magnet_loaded():
            return False, "Upload datasets first."
        return True, ""

    # ------------------------------------------------------------------
    # Getters
    # ------------------------------------------------------------------

    def get_blackbox(self) -> Optional[pd.DataFrame]:
        return self._blackbox
        
    def get_scoped_blackbox_df(self, scope: Dict[str, Any]) -> Tuple[Optional[pd.DataFrame], Dict[str, Any]]:
        """
        Stateless fetching of blackbox dataset based on the requested scope.
        Returns the filtered dataframe and a metadata dict detailing the scoping applied.
        """
        df = self._original_blackbox
        if df is None or df.empty:
            return None, {}
            
        mode = scope.get("mode", "all")
        selected = scope.get("selected_categories", [])
        cat_col = scope.get("category_column", "")
        
        orig_len = len(df)
        
        if mode == "all" or not selected or not cat_col:
            # Return full dataset
            meta = {
                "mode": "all",
                "selected_categories": [],
                "category_column": cat_col,
                "total_rows": orig_len,
                "active_rows": orig_len,
                "excluded_rows": 0,
                "scope_key": "all"
            }
            return df.copy(), meta
            
        # Filter dataframe statelessly
        cat_s = df[cat_col].fillna("Uncategorized").astype(str).str.strip()
        filtered_df = df[cat_s.isin(selected)].copy()
        filt_len = len(filtered_df)
        
        meta = {
            "mode": "selected",
            "selected_categories": selected,
            "category_column": cat_col,
            "total_rows": orig_len,
            "active_rows": filt_len,
            "excluded_rows": orig_len - filt_len,
            "scope_key": scope.get("scope_key", "|".join(selected))
        }
        
        return filtered_df, meta

    def get_magnet(self) -> Optional[pd.DataFrame]:
        return self._magnet

    def get_scoped_magnet_df(
        self,
        scope: Dict[str, Any],
        blackbox_df: Optional[pd.DataFrame] = None,
    ) -> Tuple[Optional[pd.DataFrame], Dict[str, Any]]:
        import re
        from collections import Counter

        magnet_df = self._magnet
        if magnet_df is None or magnet_df.empty:
            return None, {}

        orig_len = len(magnet_df)
        mode = scope.get("mode", "all")
        selected = scope.get("selected_categories", [])

        default_meta = {
            "mode": "keyword_wide",
            "matchedKeywordCount": orig_len,
            "totalKeywordCount": orig_len,
            "excludedKeywordCount": 0,
            "mappingConfidence": 100.0,
            "selectedCategories": selected,
            "mappingMethod": "Full Magnet dataset (all categories)",
            "topScopedPhrases": [],
            "topMatchedKeywords": [],
            "scope_key": "all",
        }

        if mode == "all" or not selected or blackbox_df is None or blackbox_df.empty:
            return magnet_df.copy(), default_meta

        title_col = find_column(blackbox_df, ["Title", "Product Title", "Item Name"])
        if not title_col:
            empty = magnet_df.iloc[0:0].copy()
            return empty, {
                **default_meta,
                "mode": "category_mapped",
                "matchedKeywordCount": 0,
                "excludedKeywordCount": orig_len,
                "mappingConfidence": 0.0,
                "mappingMethod": "No product titles in scoped BlackBox",
                "scope_key": "|".join(selected) + "_kw",
            }

        full_df = self._original_blackbox
        cat_col = scope.get("category_column", "")
        stop_words = {
            "for", "and", "the", "with", "in", "of", "a", "an", "to", "on", "at", "by",
            "from", "or", "as", "is", "it", "be", "are", "was", "were", "has", "have",
            "women", "womens", "men", "mens", "large", "small", "new", "best", "top",
            "good", "great", "thin", "thick", "pack", "set", "lot", "sale", "buy",
            "size", "color", "black", "white", "red", "blue", "green", "inch", "cm",
        }

        def _tokenize(text: str) -> list[str]:
            return [
                w for w in re.sub(r"[^a-z0-9]+", " ", str(text).lower()).split()
                if len(w) > 2 and w not in stop_words and not w.isnumeric()
            ]

        active_tokens: set[str] = set()
        active_bigrams: set[str] = set()
        active_counts: Counter = Counter()
        for title in blackbox_df[title_col].dropna():
            words = _tokenize(str(title))
            for w in words:
                active_tokens.add(w)
                active_counts[w] += 1
            for i in range(len(words) - 1):
                active_bigrams.add(f"{words[i]} {words[i + 1]}")

        excluded_tokens: set[str] = set()
        if full_df is not None and not full_df.empty and cat_col and cat_col in full_df.columns:
            cat_s = full_df[cat_col].fillna("Uncategorized").astype(str).str.strip()
            excluded_titles = full_df[~cat_s.isin(selected)][title_col].dropna() if title_col in full_df.columns else []
            for title in excluded_titles:
                excluded_tokens.update(_tokenize(str(title)))

        if not active_tokens:
            empty = magnet_df.iloc[0:0].copy()
            return empty, {
                **default_meta,
                "mode": "category_mapped",
                "matchedKeywordCount": 0,
                "excludedKeywordCount": orig_len,
                "mappingConfidence": 0.0,
                "mappingMethod": "No extractable phrases from scoped product titles",
                "scope_key": "|".join(selected) + "_kw",
            }

        kw_col = find_column(magnet_df, ["Keyword Phrase", "Keyword", "Search Term"])
        if not kw_col:
            return magnet_df.copy(), default_meta

        def _keyword_matches(kw: Any) -> bool:
            if pd.isna(kw):
                return False
            kw_norm = re.sub(r"[^a-z0-9]+", " ", str(kw).lower()).strip()
            if not kw_norm:
                return False
            if any(bg in kw_norm for bg in active_bigrams):
                return True
            words = kw_norm.split()
            active_hits = sum(1 for w in words if w in active_tokens)
            excluded_hits = sum(1 for w in words if w in excluded_tokens)
            if active_hits >= 2:
                return True
            if active_hits >= 1 and excluded_hits == 0:
                return True
            if active_hits >= 1 and active_hits > excluded_hits:
                return True
            return False

        mask = magnet_df[kw_col].apply(_keyword_matches)
        filtered_df = magnet_df[mask].copy()
        match_count = len(filtered_df)

        top_matched = (
            filtered_df[kw_col].dropna().astype(str).head(10).tolist()
            if match_count > 0 else []
        )
        conf = round(min(100.0, (match_count / max(1, orig_len)) * 100.0), 1) if match_count else 0.0

        meta = {
            "mode": "category_mapped",
            "matchedKeywordCount": match_count,
            "totalKeywordCount": orig_len,
            "excludedKeywordCount": orig_len - match_count,
            "mappingConfidence": conf,
            "selectedCategories": selected,
            "mappingMethod": "Token + bigram overlap with scoped product titles",
            "topScopedPhrases": [k for k, _ in active_counts.most_common(8)],
            "topMatchedKeywords": top_matched,
            "scope_key": "|".join(selected) + "_kw",
        }
        return filtered_df, meta


    def get_keyword_classification(self) -> Optional[pd.DataFrame]:
        return self._keyword_classification

    def remove_dataset(self, dataset_type: str) -> dict:
        if dataset_type == "blackbox":
            self._blackbox = None
            self._original_blackbox = None
            self._selected_category_column = ""
            self._selected_categories = []
            self._category_pending = False
            self._use_full_blackbox = False
            self._meta["blackbox"] = {
                "rows": 0, "columns": [], "original_rows": 0, "filtered_rows": 0, 
                "excluded_rows": 0, "selected_category_column": "", "selected_categories": [],
                "category_selection_required": False, "category_selection_confirmed": False,
                "use_full_blackbox": False, "filename": ""
            }
        elif dataset_type == "magnet":
            self._magnet = None
            self._meta["magnet"] = {"rows": 0, "columns": [], "filename": ""}
        elif dataset_type == "keyword_classification":
            self._keyword_classification = None
            self._meta["keyword_classification"] = {"rows": 0, "columns": [], "filename": ""}
        else:
            return {"status": "error", "message": f"Unknown dataset type: {dataset_type}"}
        
        return {"status": "success", "message": f"Dataset {dataset_type} removed from registry"}

    # ------------------------------------------------------------------
    # Status helpers
    # ------------------------------------------------------------------

    def is_blackbox_loaded(self) -> bool:
        return self._blackbox is not None and not self._blackbox.empty

    def is_blackbox_uploaded(self) -> bool:
        return self._original_blackbox is not None and not self._original_blackbox.empty

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
            "blackbox_uploaded": self.is_blackbox_uploaded(),
            "blackbox_scope_ready": self.is_blackbox_scope_ready(),
            "magnet": self.is_magnet_loaded(),
            "keyword_classification": self.is_keyword_classification_loaded(),
        }

    def get_meta(self) -> Dict:
        return self._meta

    def rows_loaded(self) -> Dict[str, int]:
        return {k: v["rows"] for k, v in self._meta.items()}


# Global singleton — imported by all engines and routes
registry = DatasetRegistry()
