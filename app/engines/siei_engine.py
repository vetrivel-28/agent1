"""
Keyword Conversion Intelligence Engine
=======================================
Purpose  : Identify which keywords convert demand into sales efficiently,
           and where revenue is leaking due to poor conversion.
Dataset  : Magnet Keyword dataset
Required : ABA Total Click Share + ABA Total Conv. Share

Core logic — percentile-based, no fixed thresholds:

  Step 1  Click Share Percentile
          Higher click share = higher percentile (0-100).

  Step 2  Conversion Share Percentile
          Higher conversion share = higher percentile (0-100).

  Step 3  Conversion Efficiency Score
          gap = conv_pct - click_pct
          efficiency = norm(0.5 * gap_shifted + 0.3 * conv_pct + 0.2 * vol_pct)
          Normalised to 0-100 across all keywords.
          Produces a natural distribution (not binary 0/100).

  Step 4  Demand Strength
          Search Volume Percentile (0-100).

Quadrant classification (midpoint = 50):
  High demand + high efficiency  → Demand Winner
  Low demand  + high efficiency  → Hidden Gem
  High demand + low efficiency   → Friction Keyword
  Low demand  + low efficiency   → Low Priority

Data quality check:
  If >80% of conv_share values are identical, flag as low-quality data.
"""
from __future__ import annotations

import time
from typing import Any, Dict, List, Optional

import numpy as np
import pandas as pd

from app.utils.column_mapper import find_column
from app.utils.logger import get_logger
from app.utils.normalization import min_max_normalize
from app.utils.numeric_cleaner import clean_numeric_series

logger = get_logger("siei_engine")

_CLICK_SHARE_CANDIDATES = [
    "ABA Total Click Share", "ABA Total Click Share (%)", "Click Share", "click share",
    "Total Click Share",
]
_CONV_SHARE_CANDIDATES = [
    "ABA Total Conv. Share", "ABA Total Conversion Share", "Conversion Share",
    "conv share", "Total Conv. Share",
]
_KEYWORD_CANDIDATES  = ["Keyword Phrase", "Keyword"]
_SEARCH_VOL_CANDIDATES = ["Search Volume", "search volume", "SearchVolume", "Monthly Search Volume"]
_KEYWORD_SALES_CANDIDATES = ["Keyword Sales", "keyword sales", "Sales", "sales"]
_TITLE_DENSITY_CANDIDATES = ["Title Density", "title density", "TitleDensity"]

_CLICKS_CANDIDATES = ["Clicks", "clicks", "PPC Clicks"]
_ORDERS_CANDIDATES = ["Orders", "orders", "PPC Orders", "Total Orders"]
_CVR_CANDIDATES = ["Conversion Rate", "CVR", "CR", "conversion rate"]


def _opportunity_level(efficiency: float) -> str:
    if efficiency >= 75: return "Critical"
    if efficiency >= 50: return "High"
    if efficiency >= 25: return "Moderate"
    return "Low"


def _quadrant(demand_pct: float, efficiency: float) -> str:
    if demand_pct >= 50 and efficiency >= 50:
        return "Demand Winner"
    elif demand_pct < 50 and efficiency >= 50:
        return "Hidden Gem"
    elif demand_pct >= 50 and efficiency < 50:
        return "Friction Keyword"
    else:
        return "Low Priority"


def run(magnet_df: Optional[pd.DataFrame], top_n: int = 10) -> Dict[str, Any]:
    t0 = time.time()

    rows_before = len(magnet_df) if magnet_df is not None else 0
    if magnet_df is None or magnet_df.empty:
        return _error("Magnet dataset is required.", [], [], rows_before, t0)

    click_col   = find_column(magnet_df, _CLICK_SHARE_CANDIDATES)
    conv_col    = find_column(magnet_df, _CONV_SHARE_CANDIDATES)
    keyword_col = find_column(magnet_df, _KEYWORD_CANDIDATES)
    vol_col     = find_column(magnet_df, _SEARCH_VOL_CANDIDATES)
    sales_col   = find_column(magnet_df, _KEYWORD_SALES_CANDIDATES)
    clicks_col  = find_column(magnet_df, _CLICKS_CANDIDATES)
    orders_col  = find_column(magnet_df, _ORDERS_CANDIDATES)
    cvr_col     = find_column(magnet_df, _CVR_CANDIDATES)

    if click_col is None or conv_col is None:
        missing = [c for c, col in [("ABA Total Click Share", click_col), ("ABA Total Conv. Share", conv_col)] if col is None]
        return _error(f"Required columns not found: {', '.join(missing)}", ["magnet"], [], rows_before, t0)

    columns_used = [c for c in [click_col, conv_col, keyword_col, vol_col, sales_col, clicks_col, orders_col, cvr_col] if c]

    # ── Build working frame ──────────────────────────────────────────────────
    work = pd.DataFrame(index=magnet_df.index)
    work["click_share"], _ = clean_numeric_series(magnet_df[click_col], click_col)
    work["conv_share"],  _ = clean_numeric_series(magnet_df[conv_col],  conv_col)
    if keyword_col: work["keyword"]    = magnet_df[keyword_col].astype(str)
    if vol_col:     work["search_vol"], _ = clean_numeric_series(magnet_df[vol_col], vol_col)
    else:           work["search_vol"] = 0.0
    if sales_col:   work["kw_sales"],  _ = clean_numeric_series(magnet_df[sales_col], sales_col)
    else:           work["kw_sales"]   = 0.0
    
    if clicks_col:  work["clicks"], _ = clean_numeric_series(magnet_df[clicks_col], clicks_col)
    else:           work["clicks"] = None
    if orders_col:  work["orders"], _ = clean_numeric_series(magnet_df[orders_col], orders_col)
    else:           work["orders"] = None
    if cvr_col:     work["cvr"], _ = clean_numeric_series(magnet_df[cvr_col], cvr_col)
    else:           work["cvr"] = None

    work = work.dropna(subset=["click_share", "conv_share"])
    work = work[(work["click_share"] >= 0) & (work["conv_share"] >= 0)]
    rows_after = len(work)

    if rows_after < 3:
        return _error("Insufficient valid rows after cleaning (need ≥ 3).", ["magnet"], columns_used, rows_before, t0)

    n = rows_after

    # ── Confidence Level ─────────────────────────────────────────────────────
    if clicks_col and orders_col and cvr_col:
        confidence_level = "High"
    elif sales_col or vol_col:
        confidence_level = "Medium"
    else:
        confidence_level = "Low"

    # ── Data quality check ───────────────────────────────────────────────────
    conv_unique_ratio = work["conv_share"].nunique() / max(n, 1)
    top_conv_val_pct  = (work["conv_share"].value_counts().iloc[0] / n) if n > 0 else 0
    data_quality_warning = bool(top_conv_val_pct > 0.80)
    if data_quality_warning:
        logger.warning(
            f"Data quality: {top_conv_val_pct*100:.0f}% of conv_share values are identical. "
            "Efficiency scores may not be meaningful."
        )

    # ── Step 1: Click Share Percentile ───────────────────────────────────────
    work["click_rank"]  = work["click_share"].rank(method="average", ascending=False)
    work["click_pct"]   = (1.0 - (work["click_rank"] - 1) / max(n - 1, 1)) * 100.0
    work["click_pct"]   = work["click_pct"].clip(0, 100)

    # ── Step 2: Conversion Share Percentile ──────────────────────────────────
    work["conv_rank"]   = work["conv_share"].rank(method="average", ascending=False)
    work["conv_pct"]    = (1.0 - (work["conv_rank"] - 1) / max(n - 1, 1)) * 100.0
    work["conv_pct"]    = work["conv_pct"].clip(0, 100)

    # ── Step 3: Demand Strength (Search Volume Percentile) ───────────────────
    work["vol_rank"]    = work["search_vol"].rank(method="average", ascending=False)
    work["vol_pct"]     = (1.0 - (work["vol_rank"] - 1) / max(n - 1, 1)) * 100.0
    work["vol_pct"]     = work["vol_pct"].clip(0, 100)

    # ── Step 4: Conversion Efficiency Score ──────────────────────────────────
    # gap: positive = converts better than it clicks (efficient)
    # negative = clicks more than it converts (friction)
    work["gap"]         = work["conv_pct"] - work["click_pct"]
    gap_shifted         = (work["gap"] + 100.0) / 2.0   # map -100..+100 → 0..100
    raw_score           = 0.50 * gap_shifted + 0.30 * work["conv_pct"] + 0.20 * work["vol_pct"]
    work["efficiency"]  = min_max_normalize(raw_score)   # 0-100, natural distribution

    # ── Step 5: Quadrant + opportunity level ─────────────────────────────────
    work["quadrant"]    = work.apply(lambda r: _quadrant(r["vol_pct"], r["efficiency"]), axis=1)
    work["opportunity_level"] = work["efficiency"].apply(
        lambda e: _opportunity_level(100 - e)  # low efficiency = high opportunity
    )

    # ── Segment counts ────────────────────────────────────────────────────────
    quad_counts = work["quadrant"].value_counts().to_dict()
    high_intent_count = int((work["efficiency"] >= work["efficiency"].median()).sum())
    friction_count    = int(quad_counts.get("Friction Keyword", 0))

    avg_efficiency    = round(float(work["efficiency"].mean()), 2)

    # ── Estimated lost revenue (friction keywords) ────────────────────────────
    # For friction keywords: potential = (click_share / avg_click_share) * avg_kw_sales
    # minus actual kw_sales. Proxy for revenue trapped in poor conversion.
    friction_mask = work["quadrant"] == "Friction Keyword"
    avg_click     = float(work["click_share"].mean()) or 1.0
    avg_sales     = float(work["kw_sales"].mean()) or 0.0
    work["potential_sales"] = (work["click_share"] / avg_click) * avg_sales
    work["lost_sales"]      = (work["potential_sales"] - work["kw_sales"]).clip(lower=0)
    total_lost_revenue      = round(float(work.loc[friction_mask, "lost_sales"].sum()), 2)

    # ── Extra Metrics ─────────────────────────────────────────────────────────
    work["revenue_per_click"] = None
    if clicks_col and sales_col:
        valid_clicks = work["clicks"] > 0
        work.loc[valid_clicks, "revenue_per_click"] = work.loc[valid_clicks, "kw_sales"] / work.loc[valid_clicks, "clicks"]

    work["root_cause"] = None
    if friction_count > 0:
        mask_severe = friction_mask & (work["gap"] <= -20)
        work.loc[mask_severe, "root_cause"] = "Severe Conversion Leak (Click share far exceeds Conv share)"
        mask_moderate = friction_mask & (work["gap"] > -20)
        work.loc[mask_moderate, "root_cause"] = "Underperforming Conversion"

    # ── Top/bottom products ───────────────────────────────────────────────────
    demand_winners_df  = work[work["quadrant"] == "Demand Winner"].sort_values("efficiency", ascending=False)
    friction_df        = work[work["quadrant"] == "Friction Keyword"].sort_values("efficiency", ascending=True)
    hidden_gems_df     = work[work["quadrant"] == "Hidden Gem"].sort_values("efficiency", ascending=False)

    best_converting    = work.sort_values("efficiency", ascending=False).iloc[0] if n > 0 else None
    biggest_friction   = friction_df.iloc[0] if not friction_df.empty else None

    def _kw(row: pd.Series) -> str:
        return str(row.get("keyword", "—")) if row is not None else "—"

    # ── Record builder ────────────────────────────────────────────────────────
    def _records(df: pd.DataFrame, limit: Optional[int] = None) -> List[Dict]:
        out = []
        subset = df.head(limit) if limit is not None else df
        for _, row in subset.iterrows():
            rec: Dict[str, Any] = {
                "click_share":        _sv(row["click_share"]),
                "conv_share":         _sv(row["conv_share"]),
                "search_volume":      _sv(row.get("search_vol")),
                "click_percentile":   round(float(row["click_pct"]),  2),
                "conv_percentile":    round(float(row["conv_pct"]),   2),
                "demand_percentile":  round(float(row["vol_pct"]),    2),
                "efficiency_score":   round(float(row["efficiency"]), 2),
                "gap":                round(float(row["gap"]),        2),
                "quadrant":           row["quadrant"],
                "opportunity_level":  row["opportunity_level"],
                "revenue":            _sv(row.get("kw_sales")),
                "clicks":             _sv(row.get("clicks")),
                "orders":             _sv(row.get("orders")),
                "conversion_rate":    _sv(row.get("cvr")),
                "revenue_per_click":  _sv(row.get("revenue_per_click")),
                "lost_revenue_estimate": _sv(row.get("lost_sales")),
                "root_cause":         row.get("root_cause"),
            }
            if "keyword" in row.index:
                rec["keyword"] = str(row["keyword"])
            out.append(rec)
        return out

    # ── Scatter data ──────────────────────────────────────────────────────────
    scatter = []
    for _, row in work.head(300).iterrows():
        pt: Dict[str, Any] = {
            "demand_percentile":  round(float(row["vol_pct"]),    2),
            "efficiency_score":   round(float(row["efficiency"]), 2),
            "click_percentile":   round(float(row["click_pct"]),  2),
            "conv_percentile":    round(float(row["conv_pct"]),   2),
            "gap":                round(float(row["gap"]),        2),
            "quadrant":           row["quadrant"],
            "click_share":        _sv(row["click_share"]),
            "conv_share":         _sv(row["conv_share"]),
            "search_volume":      _sv(row["search_vol"]),
        }
        if "keyword" in row.index:
            pt["keyword"] = str(row["keyword"])
        scatter.append(pt)

    # ── Automated insights ────────────────────────────────────────────────────
    insights = _generate_insights(
        n=n,
        high_intent_count=high_intent_count,
        friction_count=friction_count,
        avg_efficiency=avg_efficiency,
        best_converting=best_converting,
        biggest_friction=biggest_friction,
        total_lost_revenue=total_lost_revenue,
        demand_winners_count=int(quad_counts.get("Demand Winner", 0)),
    )

    # ── Category health ───────────────────────────────────────────────────────
    friction_rate = round(friction_count / n * 100, 1)
    winner_rate   = round(int(quad_counts.get("Demand Winner", 0)) / n * 100, 1)

    if avg_efficiency >= 65:
        efficiency_status = "High — most keywords convert demand effectively"
    elif avg_efficiency >= 45:
        efficiency_status = "Moderate — meaningful conversion improvement possible"
    else:
        efficiency_status = "Low — significant demand is failing to convert"

    if friction_rate >= 30:
        conversion_leak_status = "High — large proportion of keywords underconvert"
    elif friction_rate >= 15:
        conversion_leak_status = "Moderate — notable friction across the keyword set"
    else:
        conversion_leak_status = "Low — most keywords convert near expectations"

    category_health = {
        "average_conversion_efficiency": avg_efficiency,
        "conversion_leak_rate":          f"{friction_rate}%",
        "demand_winner_ratio":           f"{winner_rate}%",
        "recoverable_revenue_pool":      total_lost_revenue,
        "efficiency_status":             efficiency_status,
        "conversion_leak_status":        conversion_leak_status,
        "data_quality_warning":          data_quality_warning,
    }

    elapsed = round(time.time() - t0, 3)
    
    # ── Full drill-down data extraction ───────────────────────────────────────
    high_intent_full_records = _records(work[work["efficiency"] >= work["efficiency"].median()].sort_values("efficiency", ascending=False))
    friction_full_records = _records(friction_df)
    
    # Audit Logging
    logger.info("====== SIEI AUDIT LOG ======")
    logger.info(f"Confidence Level: {confidence_level}")
    logger.info(f"High Intent Count: {high_intent_count} (Returned: {len(high_intent_full_records)})")
    for i, r in enumerate(high_intent_full_records[:5]):
        logger.info(f"  HI [{i+1}] {r.get('keyword', '—')}: Eff={r.get('efficiency_score')}, Gap={r.get('gap')}, Raw[Vol={r.get('search_volume')}, Click%={r.get('click_percentile')}, Conv%={r.get('conv_percentile')}] - Reason: Efficiency >= Median")
    
    logger.info(f"Friction Count: {friction_count} (Returned: {len(friction_full_records)})")
    for i, r in enumerate(friction_full_records[:5]):
        logger.info(f"  FR [{i+1}] {r.get('keyword', '—')}: Eff={r.get('efficiency_score')}, Gap={r.get('gap')}, Raw[Vol={r.get('search_volume')}, Click%={r.get('click_percentile')}, Conv%={r.get('conv_percentile')}] - Reason: {r.get('root_cause', 'Friction Quadrant')}")
    logger.info("============================")

    logger.info(
        f"Keyword Conversion Intelligence complete: n={n}, avg_eff={avg_efficiency}, "
        f"friction={friction_count}, winners={quad_counts.get('Demand Winner',0)}, elapsed={elapsed}s"
    )

    return {
        "status": "success",
        "metric_name": "Keyword Conversion Intelligence",
        "summary": (
            f"{high_intent_count} high-intent keywords identified. "
            f"{friction_count} friction keywords detected. "
            f"Average conversion efficiency: {avg_efficiency}/100."
        ),
        "datasets_used": ["magnet"],
        "columns_used": columns_used,
        "formula_used": (
            "Click Percentile = rank(click_share, desc) / n × 100; "
            "Conv Percentile = rank(conv_share, desc) / n × 100; "
            "Gap = Conv Percentile − Click Percentile; "
            "Efficiency = norm(0.5×gap_shifted + 0.3×conv_pct + 0.2×vol_pct)."
        ),
        "results": {
            # KPI summary
            "confidence_level":         confidence_level,
            "high_intent_count":        high_intent_count,
            "friction_count":           friction_count,
            "total_lost_revenue":       total_lost_revenue,
            "average_efficiency":       avg_efficiency,
            "total_keywords_analysed":  n,

            # Spotlight keywords
            "best_converting_keyword":  {
                "keyword":    _kw(best_converting),
                "efficiency": round(float(best_converting["efficiency"]), 2) if best_converting is not None else 0,
                "conv_share": _sv(best_converting["conv_share"]) if best_converting is not None else None,
            },
            "biggest_friction_keyword": {
                "keyword":    _kw(biggest_friction),
                "gap":        round(float(biggest_friction["gap"]), 2) if biggest_friction is not None else 0,
                "click_share": _sv(biggest_friction["click_share"]) if biggest_friction is not None else None,
            },

            # Segment tables
            "demand_winners":   _records(demand_winners_df,  max(top_n, 20)),
            "friction_keywords": _records(friction_df,       max(top_n, 20)),
            "hidden_gems":      _records(hidden_gems_df,     max(top_n, 20)),
            "all_keywords":     _records(work.sort_values("efficiency", ascending=False), min(n, 300)),
            
            # Full drill-down data
            "high_intent_keywords_full": high_intent_full_records,
            "friction_keywords_full":    friction_full_records,

            # Scatter data
            "scatter_data": scatter,

            # Quadrant counts
            "quadrant_summary": {
                "demand_winners":   int(quad_counts.get("Demand Winner",    0)),
                "hidden_gems":      int(quad_counts.get("Hidden Gem",       0)),
                "friction_keywords":int(quad_counts.get("Friction Keyword", 0)),
                "low_priority":     int(quad_counts.get("Low Priority",     0)),
            },

            # Category health
            "category_health": category_health,

            # Insights
            "insights": insights,

            # Legacy fields (backward compat with existing SIEI consumers)
            "market_siei_score":                avg_efficiency,
            "highest_efficiency_keywords":      _records(demand_winners_df, top_n),
            "lowest_efficiency_keywords":       _records(friction_df,       top_n),
            "market_friction_keywords":         _records(friction_df,       top_n),
            "click_heavy_low_conversion_keywords": _records(friction_df,    top_n),
            "siei_percentile_20":               round(float(work["efficiency"].quantile(0.20)), 2),
            "siei_percentile_80":               round(float(work["efficiency"].quantile(0.80)), 2),
        },
        "validation": {
            "rows_before_cleaning": rows_before,
            "rows_after_cleaning":  rows_after,
            "rows_skipped":         rows_before - rows_after,
            "numeric_columns_cleaned": [click_col, conv_col],
            "data_quality_warning": data_quality_warning,
        },
        "processing_time_seconds": elapsed,
    }


def _generate_insights(
    n: int,
    high_intent_count: int,
    friction_count: int,
    avg_efficiency: float,
    best_converting: Any,
    biggest_friction: Any,
    total_lost_revenue: float,
    demand_winners_count: int,
) -> List[str]:
    insights: List[str] = []

    if high_intent_count > 0:
        insights.append(
            f"{high_intent_count} keyword{'s' if high_intent_count > 1 else ''} convert "
            f"above category expectations — these are your strongest demand-to-sales drivers."
        )

    if friction_count > 0:
        insights.append(
            f"{friction_count} keyword{'s' if friction_count > 1 else ''} attract significant "
            f"clicks but under-convert relative to demand — representing the highest optimization priority."
        )

    if best_converting is not None:
        kw = str(best_converting.get("keyword", "—"))
        short = kw[:45] + "…" if len(kw) > 45 else kw
        eff = float(best_converting.get("efficiency", 0))
        insights.append(
            f"'{short}' delivers the strongest demand-to-sales efficiency "
            f"with a conversion efficiency score of {eff:.1f}/100."
        )

    if biggest_friction is not None:
        kw = str(biggest_friction.get("keyword", "—"))
        short = kw[:45] + "…" if len(kw) > 45 else kw
        insights.append(
            f"'{short}' attracts significant clicks but under-converts relative to demand — "
            f"the largest single conversion leak in the category."
        )

    if total_lost_revenue > 0:
        insights.append(
            f"Estimated recoverable revenue from friction keywords: "
            f"${total_lost_revenue:,.0f}. Improving conversion on these keywords "
            f"represents the highest ROI optimization opportunity."
        )

    if avg_efficiency < 40:
        insights.append(
            "Overall conversion efficiency is low. Most keywords are failing to convert "
            "demand into sales — a well-optimised listing could capture significant share."
        )
    elif avg_efficiency >= 65:
        insights.append(
            "Category conversion efficiency is strong. Most keywords are converting "
            "demand effectively into sales."
        )

    return insights


def _sv(v: Any) -> Any:
    if v is None or (isinstance(v, float) and np.isnan(v)):
        return None
    if isinstance(v, np.integer):
        return int(v)
    if isinstance(v, (np.floating, float)):
        return round(float(v), 6)
    return v


def _error(msg: str, datasets: list, cols: list, rows: int, t0: float) -> Dict:
    return {
        "status": "error",
        "metric_name": "Keyword Conversion Intelligence",
        "summary": msg,
        "datasets_used": datasets,
        "columns_used": cols,
        "formula_used": "",
        "results": {},
        "validation": {
            "status": "failed",
            "message": msg,
            "rows_before_cleaning": rows,
            "rows_after_cleaning": 0,
            "rows_skipped": rows,
            "numeric_columns_cleaned": [],
        },
        "processing_time_seconds": round(time.time() - t0, 3),
    }
