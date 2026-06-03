"""
Context Builder Utility
=======================
Extracts dataset context to feed into LLM prompts.
"""

import pandas as pd
from typing import Dict, Any, List
from collections import Counter
import re
from app.utils.column_mapper import find_column
from app.utils.logger import get_logger

logger = get_logger("context_builder")

def build_market_context(df: pd.DataFrame) -> Dict[str, Any]:
    """
    Analyzes the dataframe to extract:
    - category
    - subcategory
    - top_keywords
    - representative_products
    """
    if df is None or df.empty:
        return {"error": "Empty dataset"}
        
    title_col = find_column(df, ["Title", "title", "Product Title"])
    cat_col = find_column(df, ["Category", "category"])
    subcat_col = find_column(df, ["Subcategory", "subcategory", "Sub-Category"])
    keyword_col = find_column(df, ["Search Terms", "Keywords", "keywords", "search terms"])
    rev_col = find_column(df, ["Revenue", "revenue", "Est. Revenue", "Sales"])
    
    # 1. Category extraction
    category = "Unknown"
    if cat_col and not df[cat_col].isnull().all():
        val_counts = df[cat_col].value_counts()
        if not val_counts.empty:
            top_cat = val_counts.index[0]
            if str(top_cat).strip().lower() not in ["n/a", "unknown", "", "none"]:
                category = str(top_cat)
                
    subcategory = "Unknown"
    if subcat_col and not df[subcat_col].isnull().all():
        val_counts = df[subcat_col].value_counts()
        if not val_counts.empty:
            top_sub = val_counts.index[0]
            if str(top_sub).strip().lower() not in ["n/a", "unknown", "", "none"]:
                subcategory = str(top_sub)
                
    # 2. Representative Products
    rep_products = []
    if title_col:
        valid_df = df.dropna(subset=[title_col])
        if rev_col and not valid_df[rev_col].isnull().all():
            # Try to sort by revenue
            try:
                sorted_df = valid_df.sort_values(by=rev_col, ascending=False)
                rep_products = sorted_df[title_col].head(3).tolist()
            except Exception:
                rep_products = valid_df[title_col].head(3).tolist()
        else:
            rep_products = valid_df[title_col].head(3).tolist()
            
    # 3. Top Keywords
    top_keywords = []
    if keyword_col and not df[keyword_col].isnull().all():
        all_kws = []
        for kw in df[keyword_col].dropna():
            all_kws.extend([k.strip().lower() for k in str(kw).split(",") if k.strip()])
        if all_kws:
            top_keywords = [k[0] for k in Counter(all_kws).most_common(5)]
            
    # Fallback to title tokenization if keywords missing
    if not top_keywords and title_col:
        stop_words = {"the", "and", "or", "of", "a", "an", "in", "to", "for", "with", "on", "at", "by", "from", "up", "down", "out", "new", "black", "white", "red", "blue"}
        all_words = []
        for title in df[title_col].dropna():
            words = re.findall(r'\b[a-z]{3,}\b', str(title).lower())
            all_words.extend([w for w in words if w not in stop_words])
        if all_words:
            top_keywords = [k[0] for k in Counter(all_words).most_common(5)]

    is_valid = category != "Unknown" or (len(top_keywords) >= 2)
    
    return {
        "is_valid": is_valid,
        "category": category,
        "subcategory": subcategory,
        "top_keywords": top_keywords,
        "representative_products": rep_products
    }
