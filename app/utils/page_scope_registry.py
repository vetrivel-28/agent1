"""
Single source of truth for analytical scope per dashboard page / engine.

Keyword Intelligence = full Magnet universe (no category filter).
Product Intelligence   = category-scoped BlackBox.
Blended              = explicit dual-universe methodology documented below.
"""
from __future__ import annotations

from typing import Any, Dict, List, Literal

ScopeMode = Literal["global", "filtered", "blended", "none"]

PageScopeSpec = Dict[str, Any]

PAGE_SCOPE_REGISTRY: Dict[str, PageScopeSpec] = {
    "dashboard_overview": {
        "page": "Dashboard Overview",
        "route": "/overview",
        "keyword_scope": "global",
        "product_scope": "filtered",
        "category_dependency": True,
        "subcategory_dependency": True,
        "methodology": (
            "Keyword KPIs from full Magnet; concentration/revenue KPIs from scoped BlackBox."
        ),
        "engines": ["demand", "hhi", "sales_momentum", "revenue_momentum", "finance"],
    },
    "demand_strength": {
        "page": "Demand Intelligence",
        "route": "/demand-strength",
        "keyword_scope": "global",
        "product_scope": "none",
        "category_dependency": False,
        "subcategory_dependency": False,
        "methodology": (
            "All demand metrics (score, velocity, momentum, distribution, growth) computed "
            "exclusively from Magnet keyword rows and KC enrichment. BlackBox is not used."
        ),
        "engines": ["demand"],
        "metrics": {
            "demand_score": {"dataset": "Magnet", "filter": "valid SV > 0", "formula": "Theme-weighted demand share aggregation"},
            "demand_velocity": {"dataset": "Magnet", "filter": "none", "formula": "From demand engine trend fields when present"},
            "demand_momentum": {"dataset": "Magnet", "filter": "none", "formula": "Segment opportunity scores from keyword themes"},
            "demand_distribution": {"dataset": "Magnet", "filter": "none", "formula": "Theme demand_share = theme SV / total SV"},
            "demand_growth": {"dataset": "Magnet", "filter": "none", "formula": "YoY / search trend columns on Magnet rows"},
        },
    },
    "market_structure": {
        "page": "Market Structure",
        "route": "/market-structure",
        "keyword_scope": "none",
        "product_scope": "filtered",
        "category_dependency": True,
        "subcategory_dependency": True,
        "methodology": "HHI, brand share, concentration from scoped BlackBox only.",
        "engines": ["hhi", "direct_competitors"],
    },
    "revenue_momentum": {
        "page": "Revenue Growth",
        "route": "/revenue-momentum",
        "keyword_scope": "none",
        "product_scope": "filtered",
        "category_dependency": True,
        "subcategory_dependency": True,
        "methodology": "Brand revenue momentum from scoped BlackBox.",
        "engines": ["revenue_momentum"],
    },
    "inbound_efficiency": {
        "page": "Inbound Efficiency Index",
        "route": "/search-intent-efficiency",
        "keyword_scope": "global",
        "product_scope": "none",
        "category_dependency": False,
        "subcategory_dependency": False,
        "methodology": (
            "All SIEI metrics use Magnet only: RPS = Keyword Sales / Search Volume; "
            "recoverable revenue = (P75 RPS − keyword RPS) × SV / 1000 for friction keywords. "
            "No BlackBox rows enter efficiency formulas."
        ),
        "engines": ["siei"],
        "metrics": {
            "revenue_per_search": {"dataset": "Magnet", "product_input": None, "weighting": "none"},
            "conversion_efficiency": {"dataset": "Magnet", "product_input": None, "weighting": "percentile rank of RPS"},
            "revenue_capture_rate": {"dataset": "Magnet", "product_input": None, "weighting": "efficiency percentile vs benchmark"},
            "friction_keywords": {"dataset": "Magnet", "product_input": None, "weighting": "demand≥60 & efficiency<40"},
            "recoverable_revenue": {"dataset": "Magnet", "product_input": None, "weighting": "gap × SV / 1000"},
        },
    },
    "finance_intelligence": {
        "page": "Market Entry Intelligence",
        "route": "/finance-intelligence",
        "keyword_scope": "global",
        "product_scope": "filtered",
        "category_dependency": True,
        "subcategory_dependency": True,
        "methodology": (
            "Blended by design: advertising pressure + entry cost use Magnet; "
            "premium viability, margin compression, capital efficiency use scoped BlackBox. "
            "Finance health score weights sub-scores 25/20/25/15/15."
        ),
        "engines": ["finance"],
        "metrics": {
            "advertising_pressure": {"keyword": "Magnet CPC/SV", "product": None},
            "premium_viability": {"keyword": None, "product": "Scoped BlackBox price bands"},
            "entry_cost": {"keyword": "Magnet", "product": "Scoped BlackBox", "weighting": "module-specific"},
        },
    },
    "demand_velocity": {
        "page": "Demand Velocity",
        "route": "/demand-velocity",
        "keyword_scope": "global",
        "product_scope": "filtered",
        "category_dependency": True,
        "subcategory_dependency": True,
        "methodology": (
            "Blended velocity: mean of normalized Magnet search/YoY trends and "
            "scoped BlackBox sales/revenue trends. Each signal equally weighted."
        ),
        "engines": ["demand_velocity"],
    },
    "whitespace": {
        "page": "White Space Opportunities",
        "route": "/whitespace-opportunities",
        "keyword_scope": "global",
        "product_scope": "filtered",
        "category_dependency": True,
        "subcategory_dependency": True,
        "methodology": (
            "Keyword segments from full Magnet; optional product overlap uses scoped BlackBox."
        ),
        "engines": ["whitespace"],
    },
    "consumer_adoption": {
        "page": "Consumer Adoption Simulator",
        "route": "/consumer-adoption",
        "keyword_scope": "global",
        "product_scope": "filtered",
        "category_dependency": True,
        "subcategory_dependency": True,
        "methodology": (
            "MarketDNA pulls demand/SIEI from global Magnet engines and HHI/revenue/BSR "
            "from scoped product engines cached under active category cache_key."
        ),
        "engines": ["demand", "demand_velocity", "siei", "hhi", "price_elasticity", "revenue_momentum", "bsr_efficiency"],
    },
    "product_intelligence": {
        "page": "Product Intelligence",
        "route": "/product-intelligence",
        "keyword_scope": "global",
        "product_scope": "filtered",
        "category_dependency": True,
        "subcategory_dependency": True,
        "methodology": "KC filtered to Magnet keywords; product graphs from scoped BlackBox.",
        "engines": ["direct_competitors", "substitute", "complement", "bundle"],
    },
}


def get_page_scope(page_id: str) -> PageScopeSpec:
    return PAGE_SCOPE_REGISTRY.get(page_id, {})


def list_page_scopes() -> List[PageScopeSpec]:
    return list(PAGE_SCOPE_REGISTRY.values())
