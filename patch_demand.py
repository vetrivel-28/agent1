import re
import os

path = r"c:\Users\annie\agent1\app\engines\demand_engine.py"

with open(path, "r", encoding="utf-8") as f:
    content = f.read()

# We need to replace everything from _BUSINESS_SEGMENTS to _extract_segments (inclusive)
# And replace it with a dynamic clustering method.
# But first, let's find the exact indices.

start_marker = "# Canonical business segments only"
end_marker = "def _fallback_segment_list"

start_idx = content.find(start_marker)
end_idx = content.find(end_marker)

if start_idx == -1 or end_idx == -1:
    print("Could not find markers!")
else:
    new_logic = """
from collections import Counter
from app.utils.column_mapper import find_column
import pandas as pd

def _extract_segments(
    magnet_df: pd.DataFrame,
    sv_col: str,
    kw_sales_col: Optional[str],
    kw_col: str,
    top_n_segments: int = 6,
    max_segments: int = 12,
    blackbox_df: Optional[pd.DataFrame] = None
) -> Tuple[List[Dict[str, Any]], str]:
    \"\"\"Dynamic semantic clustering using root nouns from keywords.\"\"\"
    tmp = magnet_df[[kw_col]].copy()
    sv_c, _ = clean_numeric_series(magnet_df[sv_col], sv_col)
    tmp["_sv"] = sv_c
    tmp = tmp.dropna(subset=["_sv"])
    tmp = tmp[tmp["_sv"] > 0]
    
    if kw_sales_col:
        ks_c, _ = clean_numeric_series(magnet_df.loc[tmp.index, kw_sales_col], kw_sales_col)
        tmp["_ks"] = ks_c.fillna(0)
    else:
        tmp["_ks"] = 0.0
        
    total_sv = float(tmp["_sv"].sum())
    total_ks = float(tmp["_ks"].sum())
    
    if total_sv <= 0 or len(tmp) == 0:
        return [], "empty"
        
    # Dynamic classification: Group by last word (root noun)
    def get_root_noun(text: str) -> str:
        words = clean_text(str(text)).split()
        if not words:
            return "Other"
        w = _normalize_word(words[-1]).title()
        if len(w) < 3:
            return "Other"
        return w + "s"
        
    tmp["_segment"] = tmp[kw_col].apply(get_root_noun)
    
    # Aggregate
    agg = tmp.groupby("_segment").agg(
        total_sv=("_sv", "sum"),
        total_ks=("_ks", "sum"),
        kw_count=("_segment", "count")
    ).reset_index()
    
    # Filter small segments
    agg = agg[agg["total_sv"] > 0]
    agg = agg.sort_values("total_sv", ascending=False)
    
    # Keep top 8, group rest into "Other"
    top_segs = agg.head(8)["_segment"].tolist()
    tmp["_final_seg"] = tmp["_segment"].apply(lambda x: x if x in top_segs else "Other")
    
    final_agg = tmp.groupby("_final_seg").agg(
        total_sv=("_sv", "sum"),
        total_ks=("_ks", "sum"),
        kw_count=("_final_seg", "count")
    ).reset_index()
    
    segment_list = []
    for _, row in final_agg.iterrows():
        sv = float(row["total_sv"])
        ks = float(row["total_ks"])
        count = int(row["kw_count"])
        seg = str(row["_final_seg"])
        
        demand_share = round((sv / total_sv) * 100.0, 2)
        revenue_share = round((ks / total_ks) * 100.0, 2) if total_ks > 0 else 0.0
        comp_index = round(count / max(demand_share, 0.01), 2)
        
        segment_list.append({
            "segment": seg,
            "demand_share": demand_share,
            "keyword_count": count,
            "revenue_share": revenue_share,
            "total_search_volume": int(sv),
            "demand_revenue_gap": round(revenue_share - demand_share, 2),
            "competition_index": comp_index,
        })
        
    segment_list.sort(key=lambda x: x["demand_share"], reverse=True)
    segment_list = _enrich_segment_metrics(segment_list)
    return segment_list, "dynamic_root_noun"

def _is_business_segment(name: str) -> bool:
    return name != "Other"

"""
    # Fix calls in run
    content = content[:start_idx] + new_logic + content[end_idx:]
    
    content = content.replace(
        "segment_list, segmentation_method = _extract_segments(",
        "segment_list, segmentation_method = _extract_segments(\n"
        "        blackbox_df=blackbox_df,\n        "
    )
    
    with open(path, "w", encoding="utf-8") as f:
        f.write(content)
    print("Demand engine patched successfully!")
