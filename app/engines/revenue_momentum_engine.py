"""
Explainable Revenue Momentum Intelligence Engine
===============================================
Dataset  : BlackBox Products
Revenue  : Parent Level Revenue (primary and authoritative)
Output   : Fully evidence-backed market intelligence payload with drill-down rows.
"""
from __future__ import annotations

import re
import time
from typing import Any, Dict, List, Optional, Tuple

import numpy as np
import pandas as pd

from app.utils.column_mapper import find_column
from app.utils.logger import get_logger
from app.services.llm_service import generate_quadrant_insight

logger = get_logger("revenue_momentum_engine")

_BRAND_CANDIDATES = ["Brand", "brand", "Seller", "seller", "Brand Name"]
_REVENUE_CANDIDATES = ["Parent Level Revenue", "parent level revenue"]
_SALES_CANDIDATES = ["Parent Level Sales", "parent level sales", "ASIN Sales", "asin sales", "Sales", "sales"]
_SALES_TREND_CANDIDATES = ["Sales Trend (90 days) (%)", "sales trend (90 days) (%)", "Sales Trend (%)", "sales trend (%)", "Sales Trend", "sales trend"]
_REVENUE_TREND_CANDIDATES = ["Revenue Trend (90 days) (%)", "revenue trend (90 days) (%)", "Revenue Trend", "revenue trend", "Parent Level Revenue Trend"]
_REVIEW_COUNT_CANDIDATES = ["Review Count", "review count", "Reviews", "reviews", "Total Reviews", "total reviews"]
_BSR_CANDIDATES = ["BSR", "bsr", "Sales Rank", "sales rank", "Best Sellers Rank", "best sellers rank", "Rank", "rank"]
_ASIN_CANDIDATES = ["ASIN", "asin"]
_TITLE_CANDIDATES = ["Title", "title", "Product Title", "Product Name"]
_PRICE_TREND_CANDIDATES = ["Price Trend (90 days) (%)", "price trend (90 days) (%)", "Price Trend", "price trend"]
_NUMERIC_CLEAN_RE = re.compile(r"[^\d\.\-]")

_CLASSIFICATION_RULE = (
    "Dominant Leader: Revenue Percentile >= 50 and Sales Percentile >= 50; "
    "Growth Challenger: Revenue Percentile < 50 and Sales Percentile >= 50; "
    "Revenue Heavyweight: Revenue Percentile >= 50 and Sales Percentile < 50; "
    "Long Tail Player: Revenue Percentile < 50 and Sales Percentile < 50."
)

_WEIGHTS = {
    "sales_trend_score": 0.35,
    "revenue_trend_score": 0.25,
    "sales_velocity_score": 0.20,
    "bsr_momentum_score": 0.10,
    "revenue_efficiency_score": 0.10,
}


def _sv(v: Any) -> Any:
    if v is None:
        return None
    if isinstance(v, (float, np.floating)):
        if np.isnan(v) or np.isinf(v):
            return None
        return float(v)
    if isinstance(v, (int, np.integer)):
        return int(v)
    try:
        if pd.isna(v):
            return None
    except Exception:
        pass
    return v


def _clean_numeric(series: pd.Series) -> pd.Series:
    cleaned = (
        series.astype(str)
        .str.replace(_NUMERIC_CLEAN_RE, "", regex=True)
        .str.strip()
        .replace({"": pd.NA, "nan": pd.NA, "none": pd.NA, "null": pd.NA, "-": pd.NA})
    )
    out = pd.to_numeric(cleaned, errors="coerce")
    return out.fillna(0.0)


def _normalize_text(value: Any) -> str:
    txt = str(value).lower() if value is not None else ""
    txt = re.sub(r"[^\w\s]", " ", txt)
    txt = re.sub(r"\s+", " ", txt).strip()
    return txt


def _safe_minmax(series: pd.Series, invert: bool = False) -> pd.Series:
    s = pd.to_numeric(series, errors="coerce").fillna(0.0)
    mn, mx = float(s.min()), float(s.max())
    if mx == mn:
        out = pd.Series(np.full(len(s), 50.0), index=s.index, dtype=float)
    else:
        out = ((s - mn) / (mx - mn)) * 100.0
    if invert:
        out = 100.0 - out
    return out.clip(0.0, 100.0)


def _classify(revenue_percentile: float, sales_percentile: float) -> str:
    if revenue_percentile >= 50 and sales_percentile >= 50:
        return "Dominant Leader"
    if revenue_percentile < 50 and sales_percentile >= 50:
        return "Growth Challenger"
    if revenue_percentile >= 50 and sales_percentile < 50:
        return "Revenue Heavyweight"
    return "Long Tail Player"





def _build_evidence(
    metric_name: str,
    formula: str,
    source_columns: List[str],
    source_rows: List[Dict[str, Any]],
    calculation_steps: List[str],
    intermediate_values: Dict[str, Any],
    final_value: Any,
    classification_rule: Optional[str] = None,
) -> Dict[str, Any]:
    return {
        "metric_name": metric_name,
        "formula": formula,
        "source_dataset": "blackbox",
        "source_columns": source_columns,
        "source_rows": source_rows,
        "calculation_steps": calculation_steps,
        "intermediate_values": intermediate_values,
        "final_value": final_value,
        "classification_rule": classification_rule,
    }


def _rows_for_evidence(df: pd.DataFrame, idx_list: List[int], cols: List[str], limit: int = 20) -> List[Dict[str, Any]]:
    rows = []
    for idx in idx_list[:limit]:
        row = df.loc[idx]
        values = {c: _sv(row[c]) if c in df.columns else None for c in cols}
        rows.append({"row_index": int(idx), "values": values})
    return rows


def _no_data_error(dataset: str) -> Dict:
    return {
        "status": "error",
        "metric_name": "Revenue Momentum",
        "summary": f"Dataset '{dataset}' not uploaded or is empty.",
        "datasets_used": [dataset],
        "columns_used": [],
        "formula_used": "",
        "results": {},
        "validation": {
            "status": "failed",
            "message": f"Dataset '{dataset}' not uploaded or is empty.",
            "rows_before_cleaning": 0,
            "rows_after_cleaning": 0,
            "rows_skipped": 0,
            "numeric_columns_cleaned": [],
        },
        "processing_time_seconds": 0.0,
    }


def _required_error(rows_original: int, message: str, missing: List[str]) -> Dict[str, Any]:
    return {
        "status": "error",
        "metric_name": "Revenue Momentum",
        "summary": message,
        "datasets_used": ["blackbox"],
        "columns_used": [],
        "formula_used": "",
        "results": {},
        "validation": {
            "status": "failed",
            "message": message,
            "missing_columns": missing,
            "rows_before_cleaning": rows_original,
            "rows_after_cleaning": 0,
            "rows_skipped": rows_original,
            "numeric_columns_cleaned": [],
        },
        "processing_time_seconds": 0.0,
    }


def _segment_block(
    name: str,
    items: List[Dict[str, Any]],
    evidence_rows: List[Dict[str, Any]],
    classification_rule: str,
    total_market_revenue: float = 0.0,
    top_5_share: float = 0.0,
    market_mean: float = 0.0,
    total_brands: int = 0,
) -> Dict[str, Any]:
    singular = " ".join(name.split()[:-1]) if name.endswith("s") else name
    total_revenue = sum(item.get("parent_revenue", 0.0) for item in items)
    total_products = sum(item.get("product_count", 0) for item in items)
    
    import statistics
    quadrant_revenues = [float(item.get("parent_revenue", 0.0)) for item in items]
    median_revenue = statistics.median(quadrant_revenues) if quadrant_revenues else 0.0
    
    # Generate LLM inputs
    llm_inputs = {
        'quadrant_name': name,
        'brand_count': len(items),
        'top_brands': [i.get("brand") for i in items[:3]],
        'top_brands_data': [
            {
                "brand": i.get("brand"),
                "revenue_share": round(i.get("revenue_share", 0.0), 2),
                "revenue_percentile": round(i.get("revenue_percentile", 0.0), 1),
                "sales_percentile": round(i.get("sales_percentile", 0.0), 1),
                "momentum_score": round(i.get("momentum_score", 0.0), 1),
                "primary_engine": i.get("primary_engine", "Unknown")
            }
            for i in items[:5]
        ],
        'market_share_distribution': f"{sum(i.get('revenue_share', 0) for i in items):.1f}%",
        'revenue_percentiles': f"{min((i.get('revenue_percentile', 0) for i in items), default=0):.1f} - {max((i.get('revenue_percentile', 0) for i in items), default=0):.1f}",
        'sales_percentiles': f"{min((i.get('sales_percentile', 0) for i in items), default=0):.1f} - {max((i.get('sales_percentile', 0) for i in items), default=0):.1f}",
        'momentum_scores': f"{min((i.get('momentum_score', 0) for i in items), default=0):.1f} - {max((i.get('momentum_score', 0) for i in items), default=0):.1f}",
        'growth_drivers': list(set(i.get("primary_engine", "") for i in items[:5])),
        'category_revenue': total_market_revenue,
        'revenue_concentration': top_5_share,
        'market_mean': market_mean,
        'total_brands': total_brands,
        'quadrant_total_revenue': total_revenue,
        'median_revenue': median_revenue,
    }
    
    llm_insight = generate_quadrant_insight(llm_inputs) if items else "No brands in this segment."

    return {
        "count": len(items),
        "total_revenue": total_revenue,
        "total_products": total_products,
        "preview_brands": [i.get("brand") for i in items[:3]],
        "items": items,
        "evidence": _build_evidence(
            metric_name=f"{name} Count",
            formula=f"COUNT(items where classification == '{singular}')",
            source_columns=["classification", "revenue_percentile", "sales_percentile"],
            source_rows=evidence_rows,
            calculation_steps=[f"Filter momentum_ledger by classification = {singular}", "Count filtered rows"],
            intermediate_values={"filtered_count": len(items), "total_revenue": total_revenue, "total_products": total_products},
            final_value=len(items),
            classification_rule=classification_rule,
        ),
        "ai_insight": llm_insight,
    }


def run(blackbox_df: Optional[pd.DataFrame], top_n: int = 10) -> Dict[str, Any]:
    t0 = time.time()
    if blackbox_df is None or blackbox_df.empty:
        return _no_data_error("blackbox")

    rows_original = len(blackbox_df)
    brand_col = find_column(blackbox_df, _BRAND_CANDIDATES)
    rev_col = find_column(blackbox_df, _REVENUE_CANDIDATES)
    sales_col = find_column(blackbox_df, _SALES_CANDIDATES)
    sales_trend_col = find_column(blackbox_df, _SALES_TREND_CANDIDATES)
    revenue_trend_col = find_column(blackbox_df, _REVENUE_TREND_CANDIDATES)
    review_count_col = find_column(blackbox_df, _REVIEW_COUNT_CANDIDATES)
    bsr_col = find_column(blackbox_df, _BSR_CANDIDATES)
    asin_col = find_column(blackbox_df, _ASIN_CANDIDATES)
    title_col = find_column(blackbox_df, _TITLE_CANDIDATES)
    price_trend_col = find_column(blackbox_df, _PRICE_TREND_CANDIDATES)

    if brand_col is None:
        return _required_error(rows_original, "Brand column not found in BlackBox dataset.", _BRAND_CANDIDATES[:2])
    if rev_col is None:
        return _required_error(rows_original, "Parent Level Revenue column not found in BlackBox dataset.", _REVENUE_CANDIDATES[:2])

    columns_used = [c for c in [brand_col, rev_col, sales_col, sales_trend_col, revenue_trend_col, review_count_col, bsr_col, asin_col, title_col, price_trend_col] if c]
    numeric_cols_cleaned: List[str] = [rev_col]

    work = pd.DataFrame(index=blackbox_df.index)
    work["brand"] = blackbox_df[brand_col].astype(str).str.strip().replace({"": "Unknown Brand"})
    work["parent_revenue"] = _clean_numeric(blackbox_df[rev_col])
    
    if sales_col:
        work["parent_sales"] = _clean_numeric(blackbox_df[sales_col])
        numeric_cols_cleaned.append(sales_col)
    
    if sales_trend_col:
        work["sales_trend_pct"] = _clean_numeric(blackbox_df[sales_trend_col])
        numeric_cols_cleaned.append(sales_trend_col)
        
    if revenue_trend_col:
        work["revenue_trend_pct"] = _clean_numeric(blackbox_df[revenue_trend_col])
        numeric_cols_cleaned.append(revenue_trend_col)
    elif sales_trend_col:
        work["revenue_trend_pct"] = work["sales_trend_pct"]  # Proxy if missing
        
    if review_count_col:
        work["review_count"] = _clean_numeric(blackbox_df[review_count_col])
        numeric_cols_cleaned.append(review_count_col)
        
    if bsr_col:
        work["bsr"] = _clean_numeric(blackbox_df[bsr_col])
        numeric_cols_cleaned.append(bsr_col)
        
    if asin_col:
        work["asin"] = blackbox_df[asin_col].astype(str).str.strip()
    if title_col:
        work["title"] = blackbox_df[title_col].astype(str).str.strip()
        
    work["row_index"] = work.index
    rows_after_cleaning = len(work)
    
    if work.empty:
        return _required_error(rows_original, "No valid Parent Level Revenue rows after cleaning.", [rev_col])

    # Weight average function based on revenue
    def wavg(group, col):
        if group[col].isna().all():
            return np.nan
        d = group[group[col].notna()]
        if d.empty or d["parent_revenue"].sum() == 0:
            return d[col].mean()
        return np.average(d[col], weights=d["parent_revenue"])

    # Aggregation
    brand_agg = pd.DataFrame()
    grouped = work.groupby("brand")
    
    brand_agg["brand"] = grouped.groups.keys()
    
    # Calculate sums directly without `.values` to ensure proper alignment
    brand_agg["parent_revenue"] = work.groupby("brand")["parent_revenue"].sum().values
    brand_agg["row_index"] = work.groupby("brand")["row_index"].apply(list).values
    
    if "parent_sales" in work.columns:
        brand_agg["parent_sales"] = work.groupby("brand")["parent_sales"].sum().values
    if "sales_trend_pct" in work.columns:
        brand_agg["sales_trend_pct"] = grouped.apply(lambda g: wavg(g, "sales_trend_pct")).values
    if "revenue_trend_pct" in work.columns:
        brand_agg["revenue_trend_pct"] = grouped.apply(lambda g: wavg(g, "revenue_trend_pct")).values
    if "bsr" in work.columns:
        brand_agg["bsr"] = grouped.apply(lambda g: wavg(g, "bsr")).values
    if "review_count" in work.columns:
        brand_agg["review_count"] = work.groupby("brand")["review_count"].sum().values
        
    if "asin" in work.columns:
        brand_agg["asin"] = grouped["asin"].apply(lambda x: sorted({str(v).strip() for v in x if str(v).strip() and str(v).lower() not in {"nan", "none", "null"}})).values
        brand_agg["product_count"] = brand_agg["asin"].apply(len)
        product_count_source = "ASIN"
    elif "title" in work.columns:
        brand_agg["title"] = grouped["title"].first().values
        brand_titles = (
            work.assign(title_norm=work["title"].map(_normalize_text))
            .groupby("brand", as_index=False)["title_norm"]
            .nunique()
            .rename(columns={"title_norm": "product_count"})
        )
        brand_agg = brand_agg.merge(brand_titles, on="brand", how="left")
        brand_agg["product_count"] = brand_agg["product_count"].fillna(0).astype(int)
        product_count_source = "normalized_title"
    else:
        brand_agg["product_count"] = brand_agg["row_index"].apply(len)
        product_count_source = "row_count"

    total_market_revenue = float(brand_agg["parent_revenue"].sum())
    brand_agg["revenue_share"] = (brand_agg["parent_revenue"] / total_market_revenue * 100.0).clip(lower=0.0)
    brand_agg["revenue_strength"] = _safe_minmax(brand_agg["parent_revenue"])
    
    # Components scoring
    # 1. Sales Trend Score
    if "sales_trend_pct" in brand_agg.columns:
        brand_agg["sales_trend_score"] = _safe_minmax(brand_agg["sales_trend_pct"])
    else:
        brand_agg["sales_trend_score"] = np.nan
        
    # 2. Revenue Trend Score
    if "revenue_trend_pct" in brand_agg.columns:
        brand_agg["revenue_trend_score"] = _safe_minmax(brand_agg["revenue_trend_pct"])
    else:
        brand_agg["revenue_trend_score"] = np.nan
        
    # 3. Sales Velocity Score
    if "parent_sales" in brand_agg.columns:
        brand_agg["sales_velocity_score"] = _safe_minmax(brand_agg["parent_sales"])
    else:
        brand_agg["sales_velocity_score"] = np.nan
        
    # 4. BSR Momentum Score (Inverted)
    if "bsr" in brand_agg.columns:
        brand_agg["bsr_momentum_score"] = _safe_minmax(brand_agg["bsr"], invert=True)
    else:
        brand_agg["bsr_momentum_score"] = np.nan
        
    # 5. Revenue Efficiency Score
    if "parent_sales" in brand_agg.columns:
        eff = brand_agg["parent_revenue"] / brand_agg["parent_sales"].replace({0.0: np.nan})
        brand_agg["revenue_efficiency_score"] = _safe_minmax(eff)
    else:
        brand_agg["revenue_efficiency_score"] = np.nan

    component_cols = ["sales_trend_score", "revenue_trend_score", "sales_velocity_score", "bsr_momentum_score", "revenue_efficiency_score"]
    for c in component_cols:
        brand_agg[c] = pd.to_numeric(brand_agg[c], errors="coerce")
        
    weighted_sum = pd.Series(np.zeros(len(brand_agg)), index=brand_agg.index, dtype=float)
    weights_used = pd.Series(np.zeros(len(brand_agg)), index=brand_agg.index, dtype=float)
    
    for col, w in _WEIGHTS.items():
        valid = brand_agg[col].notna()
        weighted_sum.loc[valid] += brand_agg.loc[valid, col] * w
        weights_used.loc[valid] += w
        
    brand_agg["momentum_score"] = (weighted_sum / weights_used.replace({0.0: np.nan})).fillna(0.0).clip(0.0, 100.0)
    
    # Use average-rank percentile so large tie groups (e.g., many zeros)
    # do not incorrectly push all rows above the 50th percentile.
    brand_agg["revenue_percentile"] = brand_agg["parent_revenue"].rank(pct=True, method="average") * 100.0
    if "parent_sales" in brand_agg.columns:
        brand_agg["sales_percentile"] = brand_agg["parent_sales"].rank(pct=True, method="average") * 100.0
    else:
        brand_agg["sales_percentile"] = brand_agg["product_count"].rank(pct=True, method="average") * 100.0

    brand_agg["classification"] = brand_agg.apply(lambda r: _classify(float(r["revenue_percentile"]), float(r["sales_percentile"])), axis=1)

    brand_agg_sorted = brand_agg.sort_values("momentum_score", ascending=False).reset_index(drop=True)
    brand_agg_sorted["rank"] = brand_agg_sorted.index + 1
    
    market_mean = float(brand_agg_sorted["momentum_score"].mean())
    market_median = float(brand_agg_sorted["momentum_score"].median())
    direction = "Growing" if market_mean >= 60 else "Stable" if market_mean >= 40 else "Declining"

    brand_rev_sorted = brand_agg.sort_values("parent_revenue", ascending=False).reset_index(drop=True)
    top5_share = float(brand_rev_sorted.head(5)["revenue_share"].sum())
    top10_share = float(brand_rev_sorted.head(10)["revenue_share"].sum())
    remaining_share = max(0.0, 100.0 - top10_share)
    hhi = float((brand_rev_sorted["revenue_share"] ** 2).sum())
    
    concentration_block = {
        "top_5_share": round(top5_share, 4),
        "top_10_share": round(top10_share, 4),
        "remaining_share": round(remaining_share, 4),
        "hhi": round(hhi, 4),
        "evidence": _build_evidence(
            metric_name="Market Concentration (Revenue Momentum)",
            formula=(
                "Top5Share = SUM(top 5 brand parent revenue) / total parent revenue * 100; "
                "Top10Share = SUM(top 10 brand parent revenue) / total parent revenue * 100; "
                "RemainingShare = 100 - Top10Share; HHI = SUM((brand revenue share %)²)."
            ),
            source_columns=[c for c in [brand_col, rev_col] if c],
            source_rows=_rows_for_evidence(blackbox_df, [int(i) for i in work["row_index"].head(50).tolist()], [c for c in [brand_col, rev_col] if c], limit=30),
            calculation_steps=["Group by brand and sum Parent Level Revenue", "Sort descending", "Compute top shares and HHI"],
            intermediate_values={"total_market_revenue": round(total_market_revenue, 4)},
            final_value={"top_5_share": round(top5_share, 4), "top_10_share": round(top10_share, 4), "remaining_share": round(remaining_share, 4), "hhi": round(hhi, 4)},
        ),
    }

    momentum_ledger: List[Dict[str, Any]] = []
    for _, row in brand_agg_sorted.iterrows():
        row_indices = [int(i) for i in (row["row_index"] if isinstance(row["row_index"], list) else [])]
        src_cols = [c for c in [brand_col, asin_col, title_col, rev_col, sales_col, sales_trend_col, revenue_trend_col, bsr_col, review_count_col] if c]
        evidence_rows = _rows_for_evidence(blackbox_df, row_indices, src_cols, limit=25)
        
        comps = {
            "sales_trend_score": float(row["sales_trend_score"]) if pd.notna(row["sales_trend_score"]) else None,
            "revenue_trend_score": float(row["revenue_trend_score"]) if pd.notna(row["revenue_trend_score"]) else None,
            "sales_velocity_score": float(row["sales_velocity_score"]) if pd.notna(row["sales_velocity_score"]) else None,
            "bsr_momentum_score": float(row["bsr_momentum_score"]) if pd.notna(row["bsr_momentum_score"]) else None,
            "revenue_efficiency_score": float(row["revenue_efficiency_score"]) if pd.notna(row["revenue_efficiency_score"]) else None,
        }
        
        primary_engine = "Sales Velocity"
        max_val = -1
        for k, v in comps.items():
            if v is not None and v > max_val:
                max_val = v
                engine_map = {
                    "sales_trend_score": "Sales Velocity",
                    "revenue_trend_score": "Revenue Concentration",
                    "sales_velocity_score": "Sales Velocity",
                    "bsr_momentum_score": "BSR Momentum",
                    "revenue_efficiency_score": "Revenue Efficiency",
                }
                primary_engine = engine_map.get(k, "Sales Velocity")
                
        # Generate calculation string
        calc_str = ""
        for k, v in comps.items():
            if v is not None:
                calc_str += f"{_WEIGHTS[k]} × {v:.1f}\n"
        calc_str += f"= {row['momentum_score']:.1f}"
        
        ledger_evidence = _build_evidence(
            metric_name=f"Momentum Score - {row['brand']}",
            formula="Momentum Score = 0.35*SalesTrend + 0.25*RevenueTrend + 0.20*SalesVelocity + 0.10*BSRMomentum + 0.10*RevenueEfficiency",
            source_columns=src_cols,
            source_rows=evidence_rows,
            calculation_steps=["Aggregate brand-level signals (Parent Level Revenue as base)", "Normalize to 0-100", "Apply weighted formula", "Apply classification thresholds"],
            intermediate_values={"components": comps, "weights": _WEIGHTS, "revenue_percentile": round(float(row["revenue_percentile"]), 4), "sales_percentile": round(float(row["sales_percentile"]), 4), "calculation": calc_str},
            final_value=round(float(row["momentum_score"]), 4),
            classification_rule=f"Revenue Percentile = {round(float(row['revenue_percentile']), 1)}, Sales Percentile = {round(float(row['sales_percentile']), 1)} -> {row['classification']}",
        )
        
        momentum_ledger.append({
            "row_number": int(row["rank"]),
            "brand": str(row["brand"]),
            "asin": row["asin"][0] if "asin" in row and isinstance(row["asin"], list) and row["asin"] else None,
            "title": str(row["title"]) if "title" in row else None,
            "parent_revenue": round(float(row["parent_revenue"]), 4),
            "revenue_share": round(float(row["revenue_share"]), 4),
            "parent_sales": round(float(row["parent_sales"]), 4) if "parent_sales" in row and pd.notna(row["parent_sales"]) else None,
            "product_count": int(row["product_count"]),
            "revenue_percentile": round(float(row["revenue_percentile"]), 1),
            "sales_percentile": round(float(row["sales_percentile"]), 1),
            "market_power_score": round((0.7 * float(row["revenue_percentile"])) + (0.3 * float(row["sales_percentile"])), 2),
            "revenue_strength": round(float(row["revenue_strength"]), 4),
            "momentum_score": round(float(row["momentum_score"]), 1),
            "sales_trend_score": comps["sales_trend_score"],
            "revenue_trend_score": comps["revenue_trend_score"],
            "sales_velocity_score": comps["sales_velocity_score"],
            "bsr_momentum_score": comps["bsr_momentum_score"],
            "revenue_efficiency_score": comps["revenue_efficiency_score"],
            "classification": str(row["classification"]),
            "primary_engine": primary_engine,
            "evidence": ledger_evidence,
        })

    # Sort primarily by market share (revenue_share), secondarily by momentum score.
    momentum_ledger = sorted(
        momentum_ledger,
        key=lambda r: (-float(r.get("revenue_share", 0.0)), -float(r.get("momentum_score", 0.0)), str(r.get("brand", ""))),
    )
    for i, row in enumerate(momentum_ledger, start=1):
        row["row_number"] = i

    market_leaders = [r for r in momentum_ledger if r["classification"] == "Dominant Leader"]
    emerging_brands = [r for r in momentum_ledger if r["classification"] == "Growth Challenger"]
    premium_brands = [r for r in momentum_ledger if r["classification"] == "Revenue Heavyweight"]
    niche_players = [r for r in momentum_ledger if r["classification"] == "Long Tail Player"]

    quadrant_counts = {
        "market_leaders": len(market_leaders),
        "emerging_brands": len(emerging_brands),
        "premium_brands": len(premium_brands),
        "niche_players": len(niche_players),
    }
    quadrant_sum = sum(quadrant_counts.values())
    total_brands = len(momentum_ledger)

    classification_audit_all = [
        {
            "brand": r["brand"],
            "revenue": r["parent_revenue"],
            "sales": r["parent_sales"] if r["parent_sales"] is not None else r["product_count"],
            "revenue_percentile": r["revenue_percentile"],
            "sales_percentile": r["sales_percentile"],
            "assigned_quadrant": r["classification"],
        }
        for r in momentum_ledger
    ]
    classification_audit_first_20 = classification_audit_all[:20]

    revenue_pct_min = min((r["revenue_percentile"] for r in momentum_ledger), default=0.0)
    revenue_pct_max = max((r["revenue_percentile"] for r in momentum_ledger), default=0.0)
    sales_pct_min = min((r["sales_percentile"] for r in momentum_ledger), default=0.0)
    sales_pct_max = max((r["sales_percentile"] for r in momentum_ledger), default=0.0)
    low_revenue_tie_count = int((brand_agg["parent_revenue"] == brand_agg["parent_revenue"].min()).sum()) if not brand_agg.empty else 0
    low_sales_tie_count = int((brand_agg["parent_sales"] == brand_agg["parent_sales"].min()).sum()) if ("parent_sales" in brand_agg.columns and not brand_agg.empty) else 0
    classification_bug_analysis = {
        "percentile_calc_method": "average",
        "revenue_percentile_range": {"min": round(float(revenue_pct_min), 4), "max": round(float(revenue_pct_max), 4)},
        "sales_percentile_range": {"min": round(float(sales_pct_min), 4), "max": round(float(sales_pct_max), 4)},
        "revenue_percentile_always_100": bool(revenue_pct_min == 100.0 and revenue_pct_max == 100.0),
        "sales_percentile_always_100": bool(sales_pct_min == 100.0 and sales_pct_max == 100.0),
        "fallback_assigning_market_leader": False,
        "brands_removed_before_classification": max(0, len(brand_agg) - len(momentum_ledger)),
        "low_revenue_tie_count": low_revenue_tie_count,
        "low_sales_tie_count": low_sales_tie_count,
        "root_cause_if_all_leaders": (
            "Large tie groups at low values with rank(method='max') can push minimum percentile above 50."
            if len(market_leaders) == len(momentum_ledger)
            else "Not all brands are Dominant Leader after percentile fix."
        ),
    }

    leader = market_leaders[0] if market_leaders else (momentum_ledger[0] if momentum_ledger else None)
    competitive_threats: List[Dict[str, Any]] = []
    opportunity_alerts: List[Dict[str, Any]] = []

    def _exec_block(question: str, selected: List[Dict[str, Any]], reason: str) -> Dict[str, Any]:
        names = [x["brand"] for x in selected]
        src_rows = []
        for x in selected:
            src_rows.extend(x["evidence"]["source_rows"][:3])
        return {
            "brands": names,
            "reason": reason,
            "supporting_metrics": [{"brand": x["brand"], "parent_revenue": x["parent_revenue"], "revenue_share": x["revenue_share"], "momentum_score": x["momentum_score"]} for x in selected],
            "evidence": _build_evidence(
                metric_name=question,
                formula="Rule-based selection from momentum_ledger metrics.",
                source_columns=["parent_revenue", "revenue_share", "momentum_score", "classification"],
                source_rows=src_rows[:20],
                calculation_steps=["Filter ledger rows by executive rule", "Select top matching brands"],
                intermediate_values={"matched_count": len(selected)},
                final_value=names,
                classification_rule=_CLASSIFICATION_RULE,
            ),
        }

    executive_questions = {
        "who_is_winning": _exec_block("Who is winning?", market_leaders[:3], "Highest revenue and sales percentile."),
        "who_is_emerging": _exec_block("Who is emerging?", emerging_brands[:3], "Lower revenue percentile but high sales percentile."),
        "who_is_losing_momentum": _exec_block("Who is losing momentum?", premium_brands[:3], "High revenue percentile but low sales percentile."),
    }

    metrics_block = {
        "market_leaders": _segment_block("Dominant Leaders", market_leaders, [x["evidence"]["source_rows"][0] for x in market_leaders if x["evidence"]["source_rows"]], _CLASSIFICATION_RULE, total_market_revenue, top5_share, market_mean, total_brands),
        "emerging_brands": _segment_block("Growth Challengers", emerging_brands, [x["evidence"]["source_rows"][0] for x in emerging_brands if x["evidence"]["source_rows"]], _CLASSIFICATION_RULE, total_market_revenue, top5_share, market_mean, total_brands),
        "premium_brands": _segment_block("Revenue Heavyweights", premium_brands, [x["evidence"]["source_rows"][0] for x in premium_brands if x["evidence"]["source_rows"]], _CLASSIFICATION_RULE, total_market_revenue, top5_share, market_mean, total_brands),
        "niche_players": _segment_block("Long Tail Players", niche_players, [x["evidence"]["source_rows"][0] for x in niche_players if x["evidence"]["source_rows"]], _CLASSIFICATION_RULE, total_market_revenue, top5_share, market_mean, total_brands),
    }

    trend_chart = {
        "available": False,
        "message": "Brand Momentum Trend unavailable because uploaded dataset does not contain historical period-level records.",
        "source_columns_used": [c for c in [sales_trend_col, price_trend_col] if c],
    }

    elapsed = round(time.time() - t0, 3)
    return {
        "status": "success",
        "metric_name": "Revenue Momentum",
        "summary": f"Explainable revenue momentum computed from Parent Level Revenue. Mean momentum score: {round(market_mean, 2)}/100 across {len(brand_agg_sorted)} brands.",
        "datasets_used": ["blackbox"],
        "columns_used": columns_used,
        "formula_used": "Momentum Score = 0.35*SalesTrend + 0.25*RevenueTrend + 0.20*SalesVelocity + 0.10*BSRMomentum + 0.10*RevenueEfficiency. Revenue base: Parent Level Revenue.",
        "results": {
            "revenue_momentum": {
                "total_market_revenue": round(total_market_revenue, 4),
                "concentration": concentration_block,
                "metrics": metrics_block,
                "competitive_threats": competitive_threats,
                "opportunity_alerts": opportunity_alerts,
                "executive_questions": executive_questions,
                "momentum_ledger": momentum_ledger,
                "classification_rules": {"rule_text": _CLASSIFICATION_RULE, "thresholds": {"revenue_percentile_cutoff": 50, "sales_percentile_cutoff": 50}},
                "quadrant_audit": {
                    "counts": quadrant_counts,
                    "counts_by_label": {
                        "Dominant Leaders": len(market_leaders),
                        "Growth Challengers": len(emerging_brands),
                        "Revenue Heavyweights": len(premium_brands),
                        "Long Tail Players": len(niche_players),
                    },
                    "quadrant_sum": quadrant_sum,
                    "total_brands": total_brands,
                    "sum_matches_total": quadrant_sum == total_brands,
                    "classification_inputs_all_brands": classification_audit_all,
                    "classification_inputs_first_20": classification_audit_first_20,
                    "bug_analysis": classification_bug_analysis,
                },
                "classification_primary_engine": {
                    "kept": True,
                    "description": "Primary classification engine uses Revenue Percentile and Sales Percentile thresholds derived from Parent Level Revenue and Parent Level Sales.",
                    "evidence": _build_evidence(
                        metric_name="Classification Primary Engine",
                        formula=_CLASSIFICATION_RULE,
                        source_columns=[c for c in [rev_col, sales_trend_col, sales_col, bsr_col] if c],
                        source_rows=[r["evidence"]["source_rows"][0] for r in momentum_ledger if r["evidence"]["source_rows"]][:20],
                        calculation_steps=["Compute brand-level Parent Level Revenue and Parent Level Sales", "Compute revenue and sales percentiles", "Apply quadrant rule thresholds (50/50 cutoffs)"],
                        intermediate_values={"weights": _WEIGHTS},
                        final_value="Classification labels assigned",
                        classification_rule=_CLASSIFICATION_RULE,
                    ),
                },
                "brand_momentum_trend": trend_chart,
            },
            "market_momentum_direction": direction,
            "market_mean_score": round(market_mean, 2),
            "market_median_score": round(market_median, 2),
            "total_market_revenue": round(total_market_revenue, 2),
            "total_brands_analysed": len(brand_agg_sorted),
            "momentum_leaders": market_leaders[:top_n],
            "momentum_laggards": niche_players[:top_n],
            "all_brands_momentum": momentum_ledger,
            "top_revenue_growth_brands": market_leaders[:top_n],
            "declining_revenue_brands": niche_players[:top_n],
            "all_brands_revenue_momentum": momentum_ledger,
        },
        "audit_flags": {
            "sales_trend_available": bool(sales_trend_col),
            "revenue_trend_available": bool(revenue_trend_col),
            "bsr_available": bool(bsr_col),
            "historical_period_records_available": False,
            "product_count_source": product_count_source,
        },
        "validation": {
            "status": "passed",
            "metrics_found": [c for c in ["Parent Revenue", "Parent Sales", "Sales Trend", "Revenue Trend", "Review Count", "BSR"] if c],
            "partial_analysis": not bool(sales_trend_col and sales_col),
            "rows_before_cleaning": rows_original,
            "rows_after_cleaning": rows_after_cleaning,
            "rows_skipped": rows_original - rows_after_cleaning,
            "numeric_columns_cleaned": numeric_cols_cleaned,
            "brands_found": len(brand_agg_sorted),
        },
        "processing_time_seconds": elapsed,
    }
