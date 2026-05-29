"""
FastAPI routes — Market Intelligence Agent Phase 1.

All analysis endpoints pass the full engine result dict directly to the
response model.  The engines own the result structure; routes are thin
wrappers that:
  1. Check datasets are loaded
  2. Call the engine
  3. Return the engine dict (which already matches the response schema)
"""
from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, File, UploadFile
from fastapi.responses import FileResponse

from app.engines import (
    bsr_efficiency_engine,
    bundle_opportunity_engine,
    complement_engine,
    demand_engine,
    demand_velocity_engine,
    direct_competitor_engine,
    hhi_engine,
    price_elasticity_engine,
    revenue_momentum_engine,
    sales_momentum_engine,
    search_momentum_engine,
    siei_engine,
    substitute_engine,
    whitespace_engine,
)
from app.models.response_models import (
    BSREfficiencyResult,
    BundleOpportunityResult,
    ComplementIntelligenceResult,
    DemandStrengthResult,
    DemandVelocityResult,
    DirectCompetitorsResult,
    HHIResult,
    HealthCheck,
    MarketReportResult,
    PriceElasticityResult,
    RevenueMomentumResult,
    SalesMomentumResult,
    SIEIResult,
    SearchMomentumPhase2Result,
    SubstituteIntelligenceResult,
    UploadResponse,
    WhitespaceOpportunityResult,
)
from app.services.dataset_registry import registry
from app.services.pdf_exporter import export_market_report_pdf
from app.services.report_builder import build_report
from app.utils.dataframe_checks import is_empty_dataframe
from app.utils.logger import get_logger
from app.validators.dataset_validator import validate_csv_bytes

logger = get_logger("routes")
router = APIRouter(prefix="/api/v1", tags=["Market Intelligence"])


# =========================================================================
# Health / Status
# =========================================================================

@router.get(
    "/health",
    response_model=HealthCheck,
    summary="Health check",
    description="Returns API health status and which datasets are currently loaded.",
)
def health_check():
    logger.info("Health check requested")
    return {
        "status": "ok",
        "message": "Market Intelligence Agent is running",
        "datasets_loaded": registry.get_status(),
    }


@router.get(
    "/status",
    summary="Dataset status",
    description="Returns detailed metadata about every loaded dataset.",
)
def get_status():
    logger.info("Status check requested")
    return {
        "status": "ok",
        "datasets": registry.get_status(),
        "metadata": registry.get_meta(),
        "rows_loaded": registry.rows_loaded(),
    }


# =========================================================================
# Dataset Upload
# =========================================================================

@router.post(
    "/upload-datasets",
    response_model=UploadResponse,
    summary="Upload CSV datasets",
    description=(
        "Upload up to three CSV files:\n"
        "- **blackbox**: BlackBox Products dataset\n"
        "- **magnet**: Magnet Keyword dataset\n"
        "- **keyword_classification**: Keyword Classification dataset\n\n"
        "All files are optional per request.  "
        "Previously uploaded datasets remain in memory until replaced."
    ),
)
async def upload_datasets(
    blackbox: Optional[UploadFile] = File(None, description="BlackBox Products CSV"),
    magnet: Optional[UploadFile] = File(None, description="Magnet Keyword CSV"),
    keyword_classification: Optional[UploadFile] = File(
        None, description="Keyword Classification CSV"
    ),
):
    logger.info("Dataset upload started")

    errors = []
    rows_loaded: dict = {}
    datasets_loaded = {
        "blackbox": False,
        "magnet": False,
        "keyword_classification": False,
    }

    # ---- BlackBox ----
    if blackbox:
        try:
            content = await blackbox.read()
            ok, df, err = validate_csv_bytes(content, "blackbox")
            if ok:
                registry.set_blackbox(df)
                rows_loaded["blackbox"] = len(df)
                datasets_loaded["blackbox"] = True
                logger.info(f"BlackBox uploaded: {len(df)} rows, {len(df.columns)} cols")
            else:
                errors.append(err)
                logger.warning(f"BlackBox validation failed: {err.get('message')}")
        except Exception as exc:
            errors.append({"status": "error", "dataset": "blackbox", "message": str(exc)})
            logger.error(f"BlackBox upload exception: {exc}")

    # ---- Magnet ----
    if magnet:
        try:
            content = await magnet.read()
            ok, df, err = validate_csv_bytes(content, "magnet")
            if ok:
                registry.set_magnet(df)
                rows_loaded["magnet"] = len(df)
                datasets_loaded["magnet"] = True
                logger.info(f"Magnet uploaded: {len(df)} rows, {len(df.columns)} cols")
            else:
                errors.append(err)
                logger.warning(f"Magnet validation failed: {err.get('message')}")
        except Exception as exc:
            errors.append({"status": "error", "dataset": "magnet", "message": str(exc)})
            logger.error(f"Magnet upload exception: {exc}")

    # ---- Keyword Classification ----
    if keyword_classification:
        try:
            content = await keyword_classification.read()
            ok, df, err = validate_csv_bytes(content, "keyword_classification")
            if ok:
                registry.set_keyword_classification(df)
                rows_loaded["keyword_classification"] = len(df)
                datasets_loaded["keyword_classification"] = True
                logger.info(
                    f"Keyword Classification uploaded: {len(df)} rows, {len(df.columns)} cols"
                )
            else:
                errors.append(err)
                logger.warning(
                    f"Keyword Classification validation failed: {err.get('message')}"
                )
        except Exception as exc:
            errors.append(
                {
                    "status": "error",
                    "dataset": "keyword_classification",
                    "message": str(exc),
                }
            )
            logger.error(f"Keyword Classification upload exception: {exc}")

    # ---- Overall status ----
    any_loaded = any(datasets_loaded.values())
    if errors and not any_loaded:
        overall = "error"
        message = "All datasets failed to upload."
    elif errors:
        overall = "partial"
        message = "Some datasets uploaded successfully; see errors for details."
    elif not any_loaded:
        overall = "warning"
        message = "No files were provided. Send at least one CSV file."
    else:
        overall = "success"
        message = "All provided datasets uploaded and validated successfully."

    return {
        "status": overall,
        "message": message,
        "datasets_loaded": datasets_loaded,
        "rows_loaded": rows_loaded,
        "errors": errors if errors else None,
    }


# =========================================================================
# Analysis Engines
# =========================================================================

@router.post(
    "/demand-strength",
    response_model=DemandStrengthResult,
    summary="Demand Strength",
    description=(
        "Measures overall market demand health.\n\n"
        "**Datasets**: Magnet Keyword + BlackBox Products\n\n"
        "**Formula**: `Demand Strength = mean(norm_search_volume, norm_keyword_sales, "
        "norm_asin_sales, norm_revenue)` — each metric min-max normalised to 0-100.\n\n"
        "**Returns**: 0-100 score, top keywords by search volume, top products by sales."
    ),
)
def demand_strength(top_n: int = 10):
    logger.info(f"Demand Strength requested (top_n={top_n})")

    magnet_df = registry.get_magnet()
    blackbox_df = registry.get_blackbox()

    if is_empty_dataframe(magnet_df) and is_empty_dataframe(blackbox_df):
        return _datasets_not_loaded("Demand Strength", "magnet and/or blackbox")

    result = demand_engine.run(magnet_df, blackbox_df, top_n=top_n)
    logger.info(
        f"Demand Strength complete — status={result['status']}, "
        f"score={result.get('results', {}).get('overall_demand_score', 'n/a')}"
    )
    return result


@router.post(
    "/sales-momentum",
    response_model=SalesMomentumResult,
    summary="Sales Momentum",
    description=(
        "Measures brand-level sales acceleration.\n\n"
        "**Dataset**: BlackBox Products (grouped by Brand)\n\n"
        "**Formula**: `Sales Momentum = mean(norm_sales_trend, norm_asin_sales)` "
        "aggregated at brand level, normalised to 0-100.\n\n"
        "**Returns**: fastest-growing brands, declining brands, market direction."
    ),
)
def sales_momentum(top_n: int = 10):
    logger.info(f"Sales Momentum requested (top_n={top_n})")

    blackbox_df = registry.get_blackbox()
    if is_empty_dataframe(blackbox_df):
        return _datasets_not_loaded("Sales Momentum", "blackbox")

    result = sales_momentum_engine.run(blackbox_df, top_n=top_n)
    logger.info(
        f"Sales Momentum complete — status={result['status']}, "
        f"brands={result.get('results', {}).get('total_brands_analysed', 'n/a')}"
    )
    return result


@router.post(
    "/revenue-momentum",
    response_model=RevenueMomentumResult,
    summary="Revenue Momentum",
    description=(
        "Measures revenue acceleration by brand.\n\n"
        "**Dataset**: BlackBox Products (grouped by Brand)\n\n"
        "**Formula**: `Revenue Momentum = mean(norm_revenue, norm_revenue_trend)` "
        "— revenue summed per brand, trend averaged, normalised to 0-100.\n\n"
        "**Returns**: top revenue-growth brands, declining brands, total market revenue."
    ),
)
def revenue_momentum(top_n: int = 10):
    logger.info(f"Revenue Momentum requested (top_n={top_n})")

    blackbox_df = registry.get_blackbox()
    if is_empty_dataframe(blackbox_df):
        return _datasets_not_loaded("Revenue Momentum", "blackbox")

    result = revenue_momentum_engine.run(blackbox_df, top_n=top_n)
    logger.info(
        f"Revenue Momentum complete — status={result['status']}, "
        f"brands={result.get('results', {}).get('total_brands_analysed', 'n/a')}"
    )
    return result


@router.post(
    "/bsr-efficiency",
    response_model=BSREfficiencyResult,
    summary="BSR Efficiency",
    description=(
        "Measures revenue efficiency relative to BSR rank.\n\n"
        "**Dataset**: BlackBox Products\n\n"
        "**Formula**:\n"
        "1. `Norm BSR = (1 - BSR / max_BSR) × 100`  (lower BSR = better rank = higher score)\n"
        "2. `Norm Revenue = min-max normalised to 0-100`\n"
        "3. `Efficiency = (Norm Revenue × 0.6) + (Norm BSR × 0.4)`\n\n"
        "**Returns**: efficient products (top quartile), inefficient products (bottom quartile), "
        "market efficiency score."
    ),
)
def bsr_efficiency(top_n: int = 10):
    logger.info(f"BSR Efficiency requested (top_n={top_n})")

    blackbox_df = registry.get_blackbox()
    if is_empty_dataframe(blackbox_df):
        return _datasets_not_loaded("BSR Efficiency", "blackbox")

    result = bsr_efficiency_engine.run(blackbox_df, top_n=top_n)
    logger.info(
        f"BSR Efficiency complete — status={result['status']}, "
        f"products={result.get('results', {}).get('total_products_analysed', 'n/a')}"
    )
    return result


@router.post(
    "/demand-velocity",
    response_model=DemandVelocityResult,
    summary="Demand Velocity",
    description=(
        "Measures how fast market demand is accelerating.\n\n"
        "**Datasets**: Magnet Keyword + BlackBox Products\n\n"
        "**Formula**: `Demand Velocity = (Normalized Sales Trend + Normalized Search Trend + "
        "Normalized YoY Growth + Normalized Revenue Trend) / 4` with min-max normalization.\n\n"
        "**Returns**: velocity score, market phase, strongest/weakest growth signals, validation stats."
    ),
)
def demand_velocity(top_n: int = 10):
    logger.info(f"Demand Velocity requested (top_n={top_n})")
    magnet_df = registry.get_magnet()
    blackbox_df = registry.get_blackbox()
    if is_empty_dataframe(magnet_df) and is_empty_dataframe(blackbox_df):
        return _datasets_not_loaded("Demand Velocity", "magnet and/or blackbox")
    return demand_velocity_engine.run(magnet_df, blackbox_df, top_n=top_n)


@router.post(
    "/search-momentum",
    response_model=SearchMomentumPhase2Result,
    summary="Search Momentum",
    description=(
        "Measures alignment between search growth and sales growth.\n\n"
        "**Datasets**: Magnet Keyword + BlackBox Products\n\n"
        "**Formula**: `Search Momentum = Normalized Search Trend * Normalized Sales Trend`.\n\n"
        "**Returns**: momentum alignment, healthy keywords, weak-conversion keywords, strongest/weakest products."
    ),
)
def search_momentum(top_n: int = 10):
    logger.info(f"Search Momentum requested (top_n={top_n})")
    magnet_df = registry.get_magnet()
    blackbox_df = registry.get_blackbox()
    if is_empty_dataframe(magnet_df) or is_empty_dataframe(blackbox_df):
        return _datasets_not_loaded("Search Momentum", "magnet and blackbox")
    return search_momentum_engine.run(magnet_df, blackbox_df, top_n=top_n)


@router.post(
    "/search-intent-efficiency",
    response_model=SIEIResult,
    summary="Search Intent Efficiency Index (SIEI)",
    description=(
        "Finds keywords receiving clicks but under-converting.\n\n"
        "**Dataset**: Magnet Keyword\n\n"
        "**Formula**: `SIEI = ABA Total Conv. Share / ABA Total Click Share` "
        "with safe division and percentile-based ranking.\n\n"
        "**Returns**: highest/lowest efficiency keywords, market friction keywords, click-heavy low-conversion keywords."
    ),
)
def search_intent_efficiency(top_n: int = 10):
    logger.info(f"SIEI requested (top_n={top_n})")
    magnet_df = registry.get_magnet()
    if is_empty_dataframe(magnet_df):
        return _datasets_not_loaded("Search Intent Efficiency Index (SIEI)", "magnet")
    return siei_engine.run(magnet_df, top_n=top_n)


@router.post(
    "/market-concentration",
    response_model=HHIResult,
    summary="Market Concentration Index (HHI)",
    description=(
        "Measures monopoly vs fragmentation using Herfindahl-Hirschman Index.\n\n"
        "**Dataset**: BlackBox Products\n\n"
        "**Formula**:\n"
        "1. `Total Revenue = SUM(Revenue)`\n"
        "2. `Brand Market Share = Brand Revenue / Total Revenue`\n"
        "3. `HHI = SUM((market_share * 100)^2)`\n\n"
        "**Returns**: HHI score, structure type, top brands by share, concentration distribution."
    ),
)
def market_concentration(top_n: int = 10):
    logger.info(f"Market Concentration requested (top_n={top_n})")
    blackbox_df = registry.get_blackbox()
    if is_empty_dataframe(blackbox_df):
        return _datasets_not_loaded("Market Concentration Index (HHI)", "blackbox")
    return hhi_engine.run(blackbox_df, top_n=top_n)


# =========================================================================
# Phase 2: New Intelligence Engines
# =========================================================================

@router.post(
    "/whitespace-opportunities",
    response_model=WhitespaceOpportunityResult,
    summary="Whitespace Opportunity Analysis",
    description=(
        "Find high-demand keywords with weak competitor optimization.\n\n"
        "**Dataset**: Magnet Keyword\n\n"
        "**Formula**: `Whitespace Score = Norm(Search Volume) × (1 - Norm(Title Density))` "
        "with log scaling and percentile clipping, then normalized to 0-100.\n\n"
        "**Returns**: overall whitespace score, top SEO opportunities by keyword, "
        "opportunity distribution, market insights."
    ),
)
def whitespace_opportunities(top_n: int = 15):
    logger.info(f"Whitespace Opportunity requested (top_n={top_n})")
    magnet_df = registry.get_magnet()
    if is_empty_dataframe(magnet_df):
        return _datasets_not_loaded("Whitespace Opportunity", "magnet")
    result = whitespace_engine.run(magnet_df, None, top_n=top_n)
    logger.info(
        f"Whitespace Opportunity complete — status={result['status']}, "
        f"score={result.get('results', {}).get('overall_whitespace_score', 'n/a')}"
    )
    return result


@router.post(
    "/direct-competitors",
    response_model=DirectCompetitorsResult,
    summary="Direct Competitor Analysis",
    description=(
        "Identify direct market competitors by category, subcategory, and price.\n\n"
        "**Dataset**: BlackBox Products\n\n"
        "**Logic**: Direct competitors share same category, subcategory, and similar pricing "
        "(±15–20% dynamic range).\n\n"
        "**Formula**: `Similarity Score = 40×(category_match) + 35×(subcategory_match) + 25×(price_similarity)` "
        "normalized to 0-100.\n\n"
        "**Returns**: competitor clusters, price positioning, competition density, similarity rankings."
    ),
)
def direct_competitors(top_n: int = 15, price_tolerance_pct: float = 17.5):
    logger.info(f"Direct Competitors requested (top_n={top_n})")
    blackbox_df = registry.get_blackbox()
    if is_empty_dataframe(blackbox_df):
        return _datasets_not_loaded("Direct Competitors", "blackbox")
    result = direct_competitor_engine.run(
        None, blackbox_df, top_n=top_n, price_tolerance_pct=price_tolerance_pct
    )
    logger.info(
        f"Direct Competitors complete — status={result['status']}, "
        f"clusters={result.get('results', {}).get('total_clusters', 'n/a')}"
    )
    return result


@router.post(
    "/price-elasticity",
    response_model=PriceElasticityResult,
    summary="Price Elasticity Analysis",
    description=(
        "Find strongest-performing price ranges and identify demand dead zones.\n\n"
        "**Dataset**: BlackBox Products\n\n"
        "**Logic**: Creates adaptive price buckets using quantile-based sizing. "
        "Analyzes sales, revenue, and BSR per bucket. Detects dead zones (>50% sales drop).\n\n"
        "**Formula**: `Demand Score = avg(Norm(ASIN Sales), Norm(Revenue), Norm(1/BSR))` "
        "per price bucket.\n\n"
        "**Returns**: price buckets with demand scores, strongest ranges, dead zones, "
        "sales distribution, pricing insights."
    ),
)
def price_elasticity(n_buckets: int = 5):
    logger.info(f"Price Elasticity requested (n_buckets={n_buckets})")
    blackbox_df = registry.get_blackbox()
    if is_empty_dataframe(blackbox_df):
        return _datasets_not_loaded("Price Elasticity", "blackbox")
    result = price_elasticity_engine.run(None, blackbox_df, n_buckets=n_buckets)
    logger.info(
        f"Price Elasticity complete — status={result['status']}, "
        f"buckets={result.get('results', {}).get('bucket_count', 'n/a')}"
    )
    return result

# =========================================================================
# Ecosystem Intelligence Engines
# =========================================================================

@router.post(
    "/substitute-intelligence",
    response_model=SubstituteIntelligenceResult,
    summary="Substitute Intelligence",
    description=(
        "Identifies substitute products stealing demand from the target market.\n\n"
        "**Datasets**: Keyword Classification + BlackBox Products\n\n"
        "**Logic**:\n"
        "1. Extract keywords classified as 'Substitute'\n"
        "2. Score every BlackBox product using fuzzy + token-overlap similarity\n"
        "3. Cluster substitute products by subcategory\n\n"
        "**Formula**: `Similarity = 0.4 × bigram_overlap + 0.6 × token_jaccard`. "
        "`Market Overlap Score = min(density × mean_similarity × 3, 100)`.\n\n"
        "**Returns**: substitute keywords, matched products, subcategory clusters, "
        "market overlap score 0-100."
    ),
)
def substitute_intelligence(top_n: int = 10):
    logger.info(f"Substitute Intelligence requested (top_n={top_n})")
    kc_df       = registry.get_keyword_classification()
    blackbox_df = registry.get_blackbox()
    if is_empty_dataframe(kc_df):
        return _datasets_not_loaded("Substitute Intelligence", "keyword_classification")
    if is_empty_dataframe(blackbox_df):
        return _datasets_not_loaded("Substitute Intelligence", "blackbox")
    result = substitute_engine.run(kc_df, blackbox_df, top_n=top_n)
    logger.info(
        f"Substitute Intelligence complete — status={result['status']}, "
        f"substitutes={result.get('results', {}).get('total_substitute_products', 'n/a')}"
    )
    return result


@router.post(
    "/complement-intelligence",
    response_model=ComplementIntelligenceResult,
    summary="Complement Intelligence",
    description=(
        "Identifies complementary ecosystem products and cross-sell opportunities.\n\n"
        "**Datasets**: Keyword Classification + BlackBox Products\n\n"
        "**Logic**:\n"
        "1. Extract keywords classified as 'Complement'\n"
        "2. Score every BlackBox product using fuzzy + token-overlap similarity\n"
        "3. Compute complement_strength per product\n"
        "4. Identify cross-sell opportunities via keyword bridging\n\n"
        "**Formula**: `Complement Strength = 0.7 × similarity + 0.3 × keyword_breadth`. "
        "`Ecosystem Strength = min(density × mean_strength × 3, 100)`.\n\n"
        "**Returns**: complement keywords, matched products, ecosystem clusters, "
        "cross-sell opportunities, ecosystem strength 0-100."
    ),
)
def complement_intelligence(top_n: int = 10):
    logger.info(f"Complement Intelligence requested (top_n={top_n})")
    kc_df       = registry.get_keyword_classification()
    blackbox_df = registry.get_blackbox()
    if is_empty_dataframe(kc_df):
        return _datasets_not_loaded("Complement Intelligence", "keyword_classification")
    if is_empty_dataframe(blackbox_df):
        return _datasets_not_loaded("Complement Intelligence", "blackbox")
    result = complement_engine.run(kc_df, blackbox_df, top_n=top_n)
    logger.info(
        f"Complement Intelligence complete — status={result['status']}, "
        f"complements={result.get('results', {}).get('total_complement_products', 'n/a')}"
    )
    return result


@router.post(
    "/bundle-opportunities",
    response_model=BundleOpportunityResult,
    summary="Bundle Opportunity Analysis",
    description=(
        "Identifies high-potential bundle combinations using complement relationships.\n\n"
        "**Datasets**: Keyword Classification + BlackBox Products\n\n"
        "**Logic**:\n"
        "1. Runs complement engine to find complement products\n"
        "2. Scores (primary, complement) product pairs by demand overlap\n"
        "3. Applies category adjacency bonus\n"
        "4. Normalises bundle scores to 0-100\n\n"
        "**Formula**: `Bundle Score = (complement_strength × 0.4) + "
        "(demand_overlap × 0.4) + (category_adjacency × 0.2)`. "
        "`Ecosystem Strength = min(density × mean_score × 5, 100)`.\n\n"
        "**Returns**: ranked bundle pairs, high-potential bundles (score ≥70), "
        "bundle clusters by subcategory, ecosystem strength 0-100."
    ),
)
def bundle_opportunities(top_n: int = 10):
    logger.info(f"Bundle Opportunities requested (top_n={top_n})")
    kc_df       = registry.get_keyword_classification()
    blackbox_df = registry.get_blackbox()
    if is_empty_dataframe(kc_df):
        return _datasets_not_loaded("Bundle Opportunity", "keyword_classification")
    if is_empty_dataframe(blackbox_df):
        return _datasets_not_loaded("Bundle Opportunity", "blackbox")
    result = bundle_opportunity_engine.run(kc_df, blackbox_df, top_n=top_n)
    logger.info(
        f"Bundle Opportunities complete — status={result['status']}, "
        f"bundles={result.get('results', {}).get('total_bundle_opportunities', 'n/a')}"
    )
    return result


# =========================================================================
# Market Report
# =========================================================================

@router.post(
    "/market-report",
    response_model=MarketReportResult,
    summary="Full Market Intelligence Report",
    description=(
        "Runs all four engines and aggregates results into a structured "
        "business intelligence report.\n\n"
        "**Requires**: BlackBox dataset (mandatory). Magnet dataset (optional, enriches demand).\n\n"
        "**Returns**: JSON report with rankings, opportunity findings, risk findings, "
        "and Markdown narrative. Future-ready for PDF/HTML export."
    ),
)
def market_report(top_n: int = 10):
    logger.info(f"Market Report requested (top_n={top_n})")

    blackbox_df = registry.get_blackbox()
    magnet_df = registry.get_magnet()
    kc_df = registry.get_keyword_classification()

    if is_empty_dataframe(blackbox_df):
        return _datasets_not_loaded("Market Report", "blackbox")

    # Run all engines safely
    demand_result = demand_engine.run(magnet_df, blackbox_df, top_n=top_n)
    sales_result = sales_momentum_engine.run(blackbox_df, top_n=top_n)
    revenue_result = revenue_momentum_engine.run(blackbox_df, top_n=top_n)
    bsr_result = bsr_efficiency_engine.run(blackbox_df, top_n=top_n)

    siei_result = siei_engine.run(magnet_df, top_n=top_n) if not is_empty_dataframe(magnet_df) else None
    whitespace_result = whitespace_engine.run(magnet_df, None, top_n=top_n) if not is_empty_dataframe(magnet_df) else None
    
    direct_comp_result = direct_competitor_engine.run(None, blackbox_df, top_n=top_n) if not is_empty_dataframe(blackbox_df) else None
    price_elasticity_result = price_elasticity_engine.run(None, blackbox_df) if not is_empty_dataframe(blackbox_df) else None
    hhi_result = hhi_engine.run(blackbox_df, top_n=top_n) if not is_empty_dataframe(blackbox_df) else None
    
    search_mom_result = search_momentum_engine.run(magnet_df, blackbox_df, top_n=top_n) if not (is_empty_dataframe(magnet_df) or is_empty_dataframe(blackbox_df)) else None
    demand_vel_result = demand_velocity_engine.run(magnet_df, blackbox_df, top_n=top_n) if not (is_empty_dataframe(magnet_df) and is_empty_dataframe(blackbox_df)) else None

    substitute_result = substitute_engine.run(kc_df, blackbox_df, top_n=top_n) if not (is_empty_dataframe(kc_df) or is_empty_dataframe(blackbox_df)) else None
    complement_result = complement_engine.run(kc_df, blackbox_df, top_n=top_n) if not (is_empty_dataframe(kc_df) or is_empty_dataframe(blackbox_df)) else None
    bundle_result = bundle_opportunity_engine.run(kc_df, blackbox_df, top_n=top_n) if not (is_empty_dataframe(kc_df) or is_empty_dataframe(blackbox_df)) else None

    report = build_report(
        demand_result=demand_result,
        sales_result=sales_result,
        revenue_result=revenue_result,
        bsr_result=bsr_result,
        siei_result=siei_result,
        whitespace_result=whitespace_result,
        direct_comp_result=direct_comp_result,
        price_elasticity_result=price_elasticity_result,
        hhi_result=hhi_result,
        search_mom_result=search_mom_result,
        demand_vel_result=demand_vel_result,
        substitute_result=substitute_result,
        complement_result=complement_result,
        bundle_result=bundle_result,
        top_n=top_n,
    )

    logger.info("Market Report complete")
    return report


@router.get(
    "/market-report/pdf",
    summary="Download Market Report PDF",
    description="Generates a deterministic PDF report from current engine outputs.",
)
def market_report_pdf(top_n: int = 10):
    logger.info(f"Market Report PDF requested (top_n={top_n})")
    blackbox_df = registry.get_blackbox()
    magnet_df = registry.get_magnet()
    kc_df = registry.get_keyword_classification()
    if is_empty_dataframe(blackbox_df):
        return _datasets_not_loaded("Market Report PDF", "blackbox")

    demand_result = demand_engine.run(magnet_df, blackbox_df, top_n=top_n)
    sales_result = sales_momentum_engine.run(blackbox_df, top_n=top_n)
    revenue_result = revenue_momentum_engine.run(blackbox_df, top_n=top_n)
    bsr_result = bsr_efficiency_engine.run(blackbox_df, top_n=top_n)
    
    siei_result = siei_engine.run(magnet_df, top_n=top_n) if not is_empty_dataframe(magnet_df) else None
    whitespace_result = whitespace_engine.run(magnet_df, None, top_n=top_n) if not is_empty_dataframe(magnet_df) else None
    
    direct_comp_result = direct_competitor_engine.run(None, blackbox_df, top_n=top_n) if not is_empty_dataframe(blackbox_df) else None
    price_elasticity_result = price_elasticity_engine.run(None, blackbox_df) if not is_empty_dataframe(blackbox_df) else None
    hhi_result = hhi_engine.run(blackbox_df, top_n=top_n) if not is_empty_dataframe(blackbox_df) else None
    
    search_mom_result = search_momentum_engine.run(magnet_df, blackbox_df, top_n=top_n) if not (is_empty_dataframe(magnet_df) or is_empty_dataframe(blackbox_df)) else None
    demand_vel_result = demand_velocity_engine.run(magnet_df, blackbox_df, top_n=top_n) if not (is_empty_dataframe(magnet_df) and is_empty_dataframe(blackbox_df)) else None

    substitute_result = substitute_engine.run(kc_df, blackbox_df, top_n=top_n) if not (is_empty_dataframe(kc_df) or is_empty_dataframe(blackbox_df)) else None
    complement_result = complement_engine.run(kc_df, blackbox_df, top_n=top_n) if not (is_empty_dataframe(kc_df) or is_empty_dataframe(blackbox_df)) else None
    bundle_result = bundle_opportunity_engine.run(kc_df, blackbox_df, top_n=top_n) if not (is_empty_dataframe(kc_df) or is_empty_dataframe(blackbox_df)) else None

    report = build_report(
        demand_result=demand_result,
        sales_result=sales_result,
        revenue_result=revenue_result,
        bsr_result=bsr_result,
        siei_result=siei_result,
        whitespace_result=whitespace_result,
        direct_comp_result=direct_comp_result,
        price_elasticity_result=price_elasticity_result,
        hhi_result=hhi_result,
        search_mom_result=search_mom_result,
        demand_vel_result=demand_vel_result,
        substitute_result=substitute_result,
        complement_result=complement_result,
        bundle_result=bundle_result,
        top_n=top_n,
    )
    pdf_path = export_market_report_pdf(report)
    return FileResponse(
        path=pdf_path,
        media_type="application/pdf",
        filename="market_intelligence_report.pdf",
    )


# =========================================================================
# Internal helper
# =========================================================================

def _datasets_not_loaded(metric_name: str, required: str) -> dict:
    msg = f"Required dataset(s) not uploaded: {required}. Use POST /api/v1/upload-datasets first."
    logger.warning(f"{metric_name}: {msg}")
    return {
        "status": "error",
        "metric_name": metric_name,
        "summary": msg,
        "datasets_used": [],
        "columns_used": [],
        "formula_used": "",
        "results": {},
        "validation": {
            "status": "failed",
            "message": msg,
            "rows_before_cleaning": 0,
            "rows_after_cleaning": 0,
            "rows_skipped": 0,
            "numeric_columns_cleaned": [],
        },
        "processing_time_seconds": 0.0,
    }
