"""
Direct Competitor Engine
=========================
Purpose  : Identify direct market competitors strictly via dataset rules and semantic functional matching.
Logic    : Product-level similarity (Same Product Type, Similar Category, Similar Price, Similar Keywords).
"""
import time
import math
import numpy as np
import pandas as pd
from typing import Any, Dict, List, Optional
from difflib import SequenceMatcher

from app.utils.column_mapper import find_column
from app.utils.logger import get_logger
from app.utils.numeric_cleaner import clean_numeric_series
from app.utils.product_classifier import classify_product, is_radically_different

logger = get_logger("direct_competitor_engine")

_ASIN_CANDIDATES = ["ASIN", "asin"]
_TITLE_CANDIDATES = ["Title", "title", "Product Title"]
_BRAND_CANDIDATES = ["Brand", "brand"]
_PRICE_CANDIDATES = ["Price", "price", "List Price", "list price"]
_CATEGORY_CANDIDATES = ["Category", "category"]

def _get_core_noun(df: pd.DataFrame, cat_col: str, title_col: str) -> str:
    """Heuristic to find the core product noun."""
    if cat_col and not df[cat_col].empty:
        mode = df[cat_col].mode()
        if not mode.empty:
            cat = str(mode.iloc[0]).split(">")[-1].strip()
            if cat.lower() not in ["home & kitchen", "kitchen", "home", "other"]:
                return cat
    titles = df[title_col].dropna().astype(str).str.lower()
    if titles.empty: return "Product"
    words = pd.Series(" ".join(titles).split()).value_counts()
    for word in words.index:
        if len(word) > 3 and word not in ["with", "for", "pack", "set", "black", "white", "size"]:
            return word.capitalize()
    return "Product"

def _string_similarity(s1: str, s2: str) -> float:
    if not s1 or not s2: return 0.0
    return SequenceMatcher(None, s1.lower(), s2.lower()).ratio() * 100.0

def _keyword_overlap(s1: str, s2: str) -> float:
    if not s1 or not s2: return 0.0
    w1 = set(s1.lower().split())
    w2 = set(s2.lower().split())
    if not w1 or not w2: return 0.0
    intersection = w1.intersection(w2)
    union = w1.union(w2)
    return (len(intersection) / len(union)) * 100.0 if len(union) > 0 else 0.0

def _price_similarity(p1: float, p2: float) -> float:
    if p1 <= 0 or p2 <= 0 or math.isnan(p1) or math.isnan(p2): return 0.0
    diff = abs(p1 - p2)
    max_p = max(p1, p2)
    pct_diff = diff / max_p
    return max(0.0, (1.0 - pct_diff)) * 100.0

def run(
    magnet_df: Optional[pd.DataFrame],
    blackbox_df: Optional[pd.DataFrame],
    top_n: int = 10,
    price_tolerance_pct: float = 20.0,
) -> Dict[str, Any]:
    t0 = time.time()
    logger.info("Direct Competitor engine started.")

    if blackbox_df is None or blackbox_df.empty:
        return {"status": "error", "summary": "No BlackBox dataset available."}

    asin_col = find_column(blackbox_df, _ASIN_CANDIDATES)
    title_col = find_column(blackbox_df, _TITLE_CANDIDATES)
    brand_col = find_column(blackbox_df, _BRAND_CANDIDATES)
    price_col = find_column(blackbox_df, _PRICE_CANDIDATES)
    category_col = find_column(blackbox_df, _CATEGORY_CANDIDATES)

    if not all([category_col, price_col, asin_col, title_col]):
        return {"status": "error", "summary": "Missing required columns in BlackBox."}

    df = blackbox_df.copy()
    price_clean, _ = clean_numeric_series(df[price_col], price_col, remove_negative=True)
    df["_price_clean"] = price_clean
    df_valid = df.dropna(subset=[asin_col, category_col, "_price_clean", title_col])
    df_valid = df_valid[df_valid["_price_clean"] > 0]

    rows_after = len(df_valid)
    if rows_after == 0:
        return {"status": "error", "summary": "No valid rows after cleaning."}

    product_competitors: List[Dict[str, Any]] = []

    # Using the primary target product as reference
    refs = df_valid.head(1).to_dict('records')
    pool = df_valid.to_dict('records')
    
    core_noun = _get_core_noun(df_valid, category_col, title_col).lower()
    
    metric_name = "Similar Products"

    for ref in refs:
        ref_asin = str(ref[asin_col])
        ref_title = str(ref[title_col])
        ref_cat = str(ref[category_col])
        ref_price = float(ref["_price_clean"])
        
        ref_class = classify_product(ref_title)

        scored_candidates = []
        seen_asins = set([ref_asin])
        seen_titles = set([ref_title.lower().strip()])

        for cand in pool:
            cand_asin = str(cand[asin_col])
            cand_title = str(cand[title_col])
            cand_cat = str(cand[category_col])
            cand_price = float(cand["_price_clean"])
            cand_brand = str(cand.get(brand_col, 'N/A')) if brand_col else 'N/A'
            
            cand_class = classify_product(cand_title)

            # Rule: Radically different validation layer
            if is_radically_different(ref_class, cand_class):
                continue

            # Core noun validation: if it doesn't contain the core noun AND product type mismatches, it's NOT direct
            has_core_noun = core_noun in cand_title.lower()
            if not has_core_noun and cand_class["product_type"] != ref_class["product_type"]:
                continue

            # Deduplication rules: Exclude same ASIN, identical titles
            if cand_asin in seen_asins:
                continue
            clean_cand_title = cand_title.lower().strip()
            if clean_cand_title in seen_titles:
                continue

            # Similarity >95% rejection
            title_sim = _string_similarity(ref_title, cand_title)
            if title_sim > 95.0:
                continue

            kw_overlap = _keyword_overlap(ref_title, cand_title)
            cat_match = 100.0  # Already filtered for same category
            price_sim = _price_similarity(ref_price, cand_price)
            
            price_diff_pct = abs(ref_price - cand_price) / max(ref_price, cand_price) * 100.0

            # 40% Title, 30% KW, 20% Cat, 10% Price
            total_score = (title_sim * 0.40) + (kw_overlap * 0.30) + (cat_match * 0.20) + (price_sim * 0.10)

            seen_asins.add(cand_asin)
            seen_titles.add(clean_cand_title)
            
            reason_text = f"Shares category '{ref_cat}', price difference {round(price_diff_pct, 1)}%, and {round(kw_overlap, 1)}% keyword overlap."

            scored_candidates.append({
                "asin": cand_asin,
                "title": cand_title[:100],
                "brand": cand_brand,
                "price": round(cand_price, 2),
                "similarity_score": round(total_score, 2),
                "reason": reason_text
            })

        # Sort by similarity score
        scored_candidates.sort(key=lambda x: x['similarity_score'], reverse=True)
        
        # Apply brand diversity: Max 2 products per brand (unless brand is N/A)
        top_candidates = []
        brand_counts = {}
        
        for cand in scored_candidates:
            b = cand['brand']
            if b != 'N/A' and b != '':
                if brand_counts.get(b, 0) >= 2:
                    continue
                brand_counts[b] = brand_counts.get(b, 0) + 1
                
            top_candidates.append(cand)
            if len(top_candidates) >= top_n:
                break

        product_competitors.append({
            "reference_asin": ref_asin,
            "reference_title": ref_title[:100],
            "reference_price": round(ref_price, 2),
            "competitor_count": len(top_candidates),
            "top_competitors": top_candidates,
        })

    elapsed = round(time.time() - t0, 3)
    return {
        "status": "success",
        "metric_name": metric_name,
        "results": {
            "direct_competitors": product_competitors,
        },
        "processing_time_seconds": elapsed,
    }
