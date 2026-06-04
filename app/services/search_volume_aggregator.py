import pandas as pd
import numpy as np
from typing import Dict, Any

from app.utils.column_mapper import find_column
from app.utils.numeric_cleaner import clean_numeric_series
from app.utils.logger import get_logger

logger = get_logger("search_volume_aggregator")

_KEYWORD_CANDIDATES = [
    "Keyword Phrase", "keyword phrase", "Keyword", "keyword",
]

_SEARCH_VOL_CANDIDATES = [
    "monthly_search_volume", "Monthly Search Volume", "Search Volume", "search volume", "SearchVolume",
]

class SearchVolumeAggregator:
    _instance = None
    
    def __init__(self):
        self.keywords = []
        self.sv_array = []
        self.is_initialized = False
        
    @classmethod
    def get_instance(cls):
        if cls._instance is None:
            cls._instance = SearchVolumeAggregator()
        return cls._instance
        
    def clear(self):
        self.keywords = []
        self.sv_array = []
        self.is_initialized = False
        logger.info("SearchVolumeAggregator cache cleared.")

        
    def initialize(self, df: pd.DataFrame):
        if df is None or df.empty:
            self.is_initialized = False
            return
            
        kw_col = find_column(df, _KEYWORD_CANDIDATES)
        sv_col = find_column(df, _SEARCH_VOL_CANDIDATES)
        
        if kw_col and sv_col:
            # We must use EXACT search volumes to build the aggregation pool
            if "exact_search_volume" in df.columns:
                sv_series = df["exact_search_volume"]
            else:
                sv_series, _ = clean_numeric_series(df[sv_col], sv_col)
                
            self.keywords = df[kw_col].astype(str).str.lower().tolist()
            self.sv_array = sv_series.fillna(0).values
            self.is_initialized = True
            logger.info(f"SearchVolumeAggregator initialized with {len(self.keywords)} keywords")
        else:
            self.is_initialized = False

    def getAggregatedSearchVolume(self, rootKeyword: str) -> Dict[str, Any]:
        """
        Calculates keyword-family aggregated search volume for a given root keyword.
        Equivalent Excel logic: =SUMIF(keywordColumn,"*root keyword*",searchVolumeColumn)
        """
        if not self.is_initialized or not rootKeyword:
            return {
                "root_keyword": rootKeyword,
                "exact_volume": 0.0,
                "aggregated_volume": 0.0,
                "variant_count": 0
            }
            
        kw_clean = str(rootKeyword).strip().lower()
        if not kw_clean:
            return {
                "root_keyword": rootKeyword,
                "exact_volume": 0.0,
                "aggregated_volume": 0.0,
                "variant_count": 0
            }
            
        # Find variants
        mask = [kw_clean in k for k in self.keywords]
        agg_volume = np.sum(self.sv_array[mask])
        variant_count = sum(mask)
        
        # Exact volume
        exact_mask = [kw_clean == k for k in self.keywords]
        exact_volume = np.sum(self.sv_array[exact_mask]) if any(exact_mask) else 0.0
        
        return {
            "root_keyword": rootKeyword,
            "exact_volume": float(exact_volume),
            "aggregated_volume": float(agg_volume),
            "variant_count": int(variant_count)
        }
        
    def apply_global_aggregation(self, df: pd.DataFrame) -> pd.DataFrame:
        """
        Overrides the Search Volume column with keyword-family aggregated volume.
        Adds exact_search_volume, aggregated_search_volume, and variant_count columns.
        """
        if df is None or df.empty:
            return df
            
        kw_col = find_column(df, _KEYWORD_CANDIDATES)
        sv_col = find_column(df, _SEARCH_VOL_CANDIDATES)
        
        if not kw_col or not sv_col:
            return df
            
        # Initialize pool if not done yet
        self.initialize(df)
            
        if not self.is_initialized:
            return df
            
        logger.info(f"Applying global search volume aggregation on '{sv_col}'")
        df_out = df.copy()
        
        # Stash exact search volume if not present
        if "exact_search_volume" not in df_out.columns:
            exact_sv, _ = clean_numeric_series(df_out[sv_col], sv_col)
            df_out["exact_search_volume"] = exact_sv
            
        n = len(df_out)
        agg_sv = np.zeros(n, dtype=float)
        var_counts = np.zeros(n, dtype=int)
        
        df_keywords = df_out[kw_col].astype(str).tolist()
        
        for i, kw in enumerate(df_keywords):
            res = self.getAggregatedSearchVolume(kw)
            agg_sv[i] = res["aggregated_volume"]
            var_counts[i] = res["variant_count"]
            
        df_out["aggregated_search_volume"] = agg_sv
        df_out["variant_count"] = var_counts
        
        # We no longer overwrite sv_col here. The original column must remain intact 
        # so engines can compute accurate base sums without double counting.
        # df_out[sv_col] = agg_sv
        
        logger.info(f"Global aggregation applied to {n} rows")
        return df_out

search_volume_aggregator = SearchVolumeAggregator.get_instance()
