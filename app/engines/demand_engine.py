"""
Demand Strength Engine
======================
Purpose  : Measure overall market demand health.
Datasets : Magnet Keyword + BlackBox Products
Formula  : Demand Strength = mean of available normalised metrics
           (Search Volume, Keyword Sales, ASIN Sales, ASIN Revenue)
           Each metric is min-max normalised to 0-100 before averaging.

Numeric cleaning is applied before every normalisation step.
Rows are NEVER dropped unless both BSR and Revenue are simultaneously NaN.
"""
from __future__ import annotations

import time
import re
from typing import Any, Dict, List, Optional, Tuple

import numpy as np
import pandas as pd

from app.utils.column_mapper import find_column
from app.utils.normalization import min_max_normalize
from app.utils.logger import get_logger
from app.utils.numeric_cleaner import clean_numeric_series
from app.utils.text_matching import clean_text, tokenize_text

logger = get_logger("demand_engine")

# ---------------------------------------------------------------------------
# Column candidate lists  (ordered by preference, case-insensitive lookup)
# ---------------------------------------------------------------------------
_SEARCH_VOL_CANDIDATES = [
    "Search Volume", "search volume", "SearchVolume", "Monthly Search Volume",
]
_KW_SALES_CANDIDATES = [
    "Keyword Sales", "keyword sales", "KeywordSales",
]
_ASIN_SALES_CANDIDATES = [
    "ASIN Sales", "asin sales", "AsinSales",
    "Parent Level Sales", "parent level sales",
]
_REVENUE_CANDIDATES = [
    "ASIN Revenue", "asin revenue",
    "Revenue", "revenue",
    "Parent Level Revenue", "parent level revenue",
    "Monthly Revenue", "monthly revenue",
]
_KEYWORD_CANDIDATES = [
    "Keyword Phrase", "keyword phrase", "Keyword", "keyword",
]
_TITLE_CANDIDATES = ["Title", "title", "Product Title"]
_ASIN_CANDIDATES  = ["ASIN", "asin"]


# ---------------------------------------------------------------------------
# Seasonal / gift keyword filter
# ---------------------------------------------------------------------------
_SEASONAL_TERMS = frozenset({
    "mothers day", "mothersday", "mother's day",
    "fathers day", "fathersday", "father's day",
    "teacher appreciation",
    "christmas", "xmas",
    "valentines", "valentine's day", "valentines day",
    "easter", "halloween", "thanksgiving",
    "black friday", "cyber monday",
    "birthday gift", "birthday gifts",
    "anniversary gift", "anniversary gifts",
    "wedding gift", "wedding gifts",
    "holiday gift", "holiday gifts",
    "seasonal", "gifts for mom", "gifts for dad",
    "gifts for teacher", "gift for teacher",
})


def _is_seasonal_keyword(keyword: str) -> bool:
    """Return True if keyword contains seasonal/gift terms."""
    cleaned = clean_text(keyword)
    return any(term in cleaned for term in _SEASONAL_TERMS)


# ---------------------------------------------------------------------------
# Singular / plural normalization
# ---------------------------------------------------------------------------
_IRREGULAR_PLURALS = {
    "women": "woman", "men": "man", "children": "child",
    "teeth": "tooth", "feet": "foot", "mice": "mouse",
    "geese": "goose", "oxen": "ox", "people": "person",
}


def _normalize_word(word: str) -> str:
    """Normalize singular/plural forms to a canonical base form."""
    w = word.lower().strip()
    if w in _IRREGULAR_PLURALS:
        return _IRREGULAR_PLURALS[w]
    # Words ending in 'ies' -> 'y' (e.g. purses is already handled by 'es', but parties -> party)
    if w.endswith("ies") and len(w) > 4:
        return w[:-3] + "y"
    # Words ending in 'es' (but not 'ss')
    if w.endswith("es") and len(w) > 3 and not w.endswith("ss"):
        return w[:-2]
    # Words ending in 's' (but not 'ss')
    if w.endswith("s") and len(w) > 3 and not w.endswith("ss"):
        return w[:-1]
    return w


_TRANSLATION_MAP = {
    "para mujer": "women handbag",
    "para hombre": "men",
    "para niñas": "girls",
    "para niños": "boys",
    "bolso": "handbag",
    "bolsa de mano": "handbag",
    "bolsa de viaje": "travel bag",
    "bolsa de playa": "beach bag",
    "bolsa para laptop": "laptop bag",
    "bolsa para mujer": "women handbag",
    "bolsos para mujer": "women handbag",
    "mochila": "backpack",
    "maletín": "briefcase",
    "maletin": "briefcase",
    "sac a main": "handbag",
    "sac à main": "handbag",
}

_PHRASE_NORMALIZATIONS = {
    "hand bag": "handbag",
    "hand bags": "handbag",
    "cross body": "crossbody",
    "cross-body": "crossbody",
    "back pack": "backpack",
    "weekender bag": "travel bag",
    "computer bag": "laptop bag",
    "brief case": "briefcase",
    "bag for women": "women handbag",
    "bags for women": "women handbag",
    "bag for woman": "women handbag",
    "women bag": "women handbag",
    "woman bag": "women handbag",
    "womens bag": "women handbag",
    "ladies bag": "women handbag",
    "bag women": "women handbag",
    "women bags": "women handbag",
    "woman bags": "women handbag",
    "bags woman": "women handbag",
    "bag woman": "women handbag",
    "purse for women": "women handbag",
    "handbags for women": "women handbag",
}

# Canonical business segments only — never derived from raw keyword phrases.
_BUSINESS_SEGMENTS: Tuple[str, ...] = (
    "Handbags",
    "Tote Bags",
    "Backpacks",
    "Crossbody Bags",
    "Travel Bags",
    "Laptop Bags",
    "Beach Bags",
    "Diaper Bags",
    "Lunch Bags",
    "Gift Bags",
    "Other",
)
_BUSINESS_SEGMENT_SET = frozenset(_BUSINESS_SEGMENTS)

# Ordered most-specific first for substring matching on normalized phrases.
_SEGMENT_PATTERNS: Tuple[Tuple[str, Tuple[str, ...]], ...] = (
    ("Diaper Bags", (
        "diaper bag", "diaper bags", "nappy bag", "baby bag diaper",
    )),
    ("Lunch Bags", (
        "lunch bag", "lunch bags", "lunchbox bag", "insulated lunch bag",
        "lunch tote", "meal bag",
    )),
    ("Gift Bags", (
        "gift bag", "gift bags", "party favor bag", "favor bag",
    )),
    ("Beach Bags", (
        "beach bag", "beach bags", "pool bag", "sand bag beach",
        "bogg bag", "bogg bags",
    )),
    ("Laptop Bags", (
        "laptop bag", "laptop bags", "computer bag", "laptop case",
        "laptop backpack", "laptop messenger", "briefcase",
    )),
    ("Crossbody Bags", (
        "crossbody bag", "crossbody bags", "cross body bag", "cross-body bag",
        "crossbody purse", "sling bag",
    )),
    ("Travel Bags", (
        "travel bag", "travel bags", "luggage", "carry on bag", "carry-on bag",
        "weekender bag", "duffle bag", "duffel bag", "duffle", "duffel",
        "overnight bag", "garment bag",
    )),
    ("Backpacks", (
        "backpack", "backpacks", "back pack", "rucksack", "school backpack",
        "hiking backpack", "daypack",
    )),
    ("Tote Bags", (
        "tote bag", "tote bags", "shopping tote", "canvas tote", "market tote",
    )),
    ("Handbags", (
        "handbag", "handbags", "women handbag", "purse", "purses", "clutch",
        "satchel", "hobo bag", "shoulder bag", "evening bag", "bucket bag",
        "bag purse",
    )),
)


def _normalize_phrase(text: str) -> str:
    if not isinstance(text, str) or not text.strip():
        return ""
    text = clean_text(text)
    for phrase, replacement in _TRANSLATION_MAP.items():
        text = text.replace(phrase, replacement)
    for phrase, replacement in _PHRASE_NORMALIZATIONS.items():
        text = text.replace(phrase, replacement)
    text = re.sub(r"\s+", " ", text).strip()
    return text


def _normalized_tokens(keyword: str) -> List[str]:
    normalized = _normalize_phrase(keyword)
    tokens = tokenize_text(normalized)
    return [_normalize_word(token) for token in tokens]


_OTHER_SHARE_MAX = 20.0


def _is_business_segment(name: str) -> bool:
    return name in _BUSINESS_SEGMENT_SET and name != "Other"


def _normalized_keyword_phrase(keyword: str) -> str:
    """Full normalization pipeline for semantic matching."""
    phrase = _normalize_phrase(keyword)
    tokens = [_normalize_word(t) for t in tokenize_text(phrase)]
    return " ".join(tokens)


def _has_women_handbag_intent(phrase: str, tokens: List[str]) -> bool:
    if "women handbag" in phrase or "woman handbag" in phrase:
        return True
    token_set = set(tokens)
    has_woman = bool(token_set & {"woman", "women", "lady", "ladies", "female", "mujer"})
    has_bag = bool(token_set & {"bag", "handbag", "purse", "clutch", "satchel", "bolso", "bolsa"})
    return has_woman and has_bag


def _has_bag_context(token_set: set) -> bool:
    return bool(token_set & {
        "bag", "bags", "handbag", "handbags", "purse", "purses", "tote",
        "backpack", "backpacks", "clutch", "satchel", "bolso", "bolsa", "mochila",
    })


def _semantic_classify_keyword(keyword: str, pass_level: int = 1) -> str:
    """
    Map keyword to a canonical business segment (never a raw phrase label).
    pass_level 1 = strict patterns, 2 = token heuristics, 3 = generic bag fallback.
    """
    phrase = _normalized_keyword_phrase(keyword)
    tokens = phrase.split() if phrase else []
    token_set = set(tokens)

    if _has_women_handbag_intent(phrase, tokens):
        return "Handbags"

    for segment, patterns in _SEGMENT_PATTERNS:
        for pattern in patterns:
            if pattern in phrase:
                return segment

    if pass_level >= 2 and _has_bag_context(token_set):
        if token_set & {"diaper", "nappy"}:
            return "Diaper Bags"
        if "lunch" in token_set:
            return "Lunch Bags"
        if token_set & {"gift", "favor", "favour"} and not _is_seasonal_keyword(keyword):
            return "Gift Bags"
        if token_set & {"beach", "pool", "sand"} or "bogg" in token_set:
            return "Beach Bags"
        if token_set & {"laptop", "computer", "briefcase", "messenger"}:
            return "Laptop Bags"
        if "crossbody" in phrase or token_set & {"crossbody", "sling"}:
            return "Crossbody Bags"
        if token_set & {"travel", "luggage", "weekender", "duffle", "duffel", "overnight"}:
            return "Travel Bags"
        if "backpack" in token_set or "mochila" in token_set or "rucksack" in token_set:
            return "Backpacks"
        if "tote" in token_set:
            return "Tote Bags"
        if token_set & {"handbag", "purse", "clutch", "satchel", "hobo", "shoulder"}:
            return "Handbags"

    if pass_level >= 3 and _has_bag_context(token_set):
        return "Handbags"

    return "Other"


def _classify_keyword_records(
    keyword_records: List[Tuple[str, List[str], float, float]],
) -> List[str]:
    """Classify all keywords; escalate passes until Other share <= 20% or pass 3 exhausted."""
    labels = [_semantic_classify_keyword(kw, pass_level=1) for kw, _, _, _ in keyword_records]
    for pass_level in (2, 3):
        total_sv = sum(sv for _, _, sv, _ in keyword_records)
        other_sv = sum(
            sv for (_, _, sv, _), lab in zip(keyword_records, labels) if lab == "Other"
        )
        other_pct = (other_sv / total_sv * 100.0) if total_sv > 0 else 0.0
        if other_pct <= _OTHER_SHARE_MAX:
            break
        labels = [
            lab if lab != "Other" else _semantic_classify_keyword(kw, pass_level=pass_level)
            for (kw, _, _, _), lab in zip(keyword_records, labels)
        ]
    return labels


def _aggregate_semantic_segments(
    keyword_records: List[Tuple[str, List[str], float, float]],
    labels: List[str],
    total_sv: float,
    total_ks: float,
) -> List[Dict[str, Any]]:
    """Roll up classified keywords into business segment metrics."""
    if not keyword_records or total_sv <= 0:
        return []

    buckets: Dict[str, Dict[str, float]] = {
        name: {"total_sv": 0.0, "total_ks": 0.0, "count": 0.0}
        for name in _BUSINESS_SEGMENTS
    }

    for (_kw, _tokens, sv, ks), label in zip(keyword_records, labels):
        if label not in buckets:
            label = "Other"
        buckets[label]["total_sv"] += float(sv or 0)
        buckets[label]["total_ks"] += float(ks or 0)
        buckets[label]["count"] += 1

    segment_list: List[Dict[str, Any]] = []
    for name in _BUSINESS_SEGMENTS:
        data = buckets[name]
        count = int(data.get("count") or 0)
        if count <= 0:
            continue
        band_sv = float(data.get("total_sv") or 0)
        band_ks = float(data.get("total_ks") or 0)
        demand_share = round((band_sv / total_sv) * 100.0, 2) if total_sv > 0 else 0.0
        revenue_share = round((band_ks / total_ks) * 100.0, 2) if total_ks > 0 else 0.0
        competition_index = round(count / max(demand_share, 0.01), 2)
        segment_list.append({
            "segment": name,
            "demand_share": demand_share,
            "keyword_count": count,
            "revenue_share": revenue_share,
            "total_search_volume": int(band_sv),
            "demand_revenue_gap": round(revenue_share - demand_share, 2),
            "competition_index": competition_index,
        })

    segment_list.sort(key=lambda x: x["demand_share"], reverse=True)
    return _enrich_segment_metrics(segment_list)


def _entry_difficulty_label(competition_index: float, peer_indices: List[float]) -> str:
    """Relative entry difficulty from keyword density vs demand share."""
    if not peer_indices:
        return "Moderate"
    sorted_idx = sorted(peer_indices)
    n = len(sorted_idx)
    low_cut = sorted_idx[max(0, n // 3 - 1)]
    high_cut = sorted_idx[max(0, (2 * n) // 3 - 1)]
    if competition_index <= low_cut:
        return "Easy"
    if competition_index <= high_cut:
        return "Moderate"
    return "Hard"


def _enrich_segment_metrics(segment_list: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Add entry_difficulty and revenue_efficiency_ratio per segment."""
    named = _named_segments(segment_list)
    peer_indices = [float(s.get("competition_index") or 0) for s in named]
    for seg in segment_list:
        demand = max(float(seg.get("demand_share") or 0), 0.01)
        revenue = float(seg.get("revenue_share") or 0)
        seg["revenue_efficiency_ratio"] = round(revenue / demand, 2)
        if str(seg.get("segment", "")).lower() == "other":
            seg["entry_difficulty"] = "High"
        else:
            seg["entry_difficulty"] = _entry_difficulty_label(
                float(seg.get("competition_index") or 0), peer_indices,
            )
    return segment_list


def _revenue_efficiency_leader(segment_list: List[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
    """Segment with strongest revenue capture relative to demand share."""
    named = _named_segments(segment_list)
    if not named:
        return None
    return max(
        named,
        key=lambda s: float(s.get("revenue_efficiency_ratio") or 0),
    )


def _named_segments(segment_list: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    return [s for s in segment_list if _is_business_segment(str(s.get("segment", "")))]


def _top_named_segment(segment_list: List[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
    named = _named_segments(segment_list)
    if not named:
        return None
    return max(named, key=lambda s: float(s.get("demand_share") or 0))


def _other_share_pct(segment_list: List[Dict[str, Any]]) -> float:
    return sum(
        float(s.get("demand_share") or 0)
        for s in segment_list
        if str(s.get("segment", "")).lower() == "other"
    )


def _prepare_keyword_records(
    tmp: pd.DataFrame,
    kw_col: str,
) -> List[Tuple[str, List[str], float, float]]:
    records: List[Tuple[str, List[str], float, float]] = []
    for keyword, sv, ks in zip(
        tmp[kw_col].astype(str),
        tmp["_sv"].astype(float),
        tmp["_ks"].fillna(0).astype(float),
    ):
        if _is_seasonal_keyword(keyword):
            continue
        records.append((keyword, _normalized_tokens(keyword), float(sv), float(ks)))
    return records


def _extract_segments(
    magnet_df: pd.DataFrame,
    sv_col: str,
    kw_sales_col: Optional[str],
    kw_col: str,
    top_n_segments: int = 6,
    max_segments: int = 12,
) -> Tuple[List[Dict[str, Any]], str]:
    """Semantic business-segment clustering (no phrase-derived labels)."""
    del top_n_segments, max_segments  # fixed canonical segment taxonomy
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
    if len(tmp) == 0 or total_sv <= 0:
        return [], "empty"

    keyword_records = _prepare_keyword_records(tmp, kw_col)
    if not keyword_records:
        return [], "empty"

    labels = _classify_keyword_records(keyword_records)
    segment_list = _aggregate_semantic_segments(
        keyword_records, labels, total_sv, total_ks,
    )
    method = "semantic_categories"
    logger.info(
        "Semantic segmentation: other_share=%.2f%%, segments=%s",
        _other_share_pct(segment_list),
        len(segment_list),
    )
    return segment_list, method


def _fallback_segment_list(
    magnet_df: pd.DataFrame,
    sv_col: str,
    kw_sales_col: Optional[str],
    kw_col: str,
) -> List[Dict[str, Any]]:
    """Re-run semantic segmentation when primary path fails."""
    try:
        segments, _ = _extract_segments(magnet_df, sv_col, kw_sales_col, kw_col)
        return segments
    except Exception:
        return []


def _demand_concentration_score(segment_list: List[Dict[str, Any]]) -> float:
    """HHI-style concentration score (0-100). Higher = more concentrated."""
    if not segment_list:
        return 0.0
    shares = [s["demand_share"] / 100.0 for s in segment_list]
    hhi = sum(s * s for s in shares) * 100
    return round(min(hhi, 100.0), 2)


def _demand_concentration_meta(score: float) -> Dict[str, str]:
    """Human-readable concentration tier for executive KPIs."""
    if score < 30:
        return {"label": "Fragmented Demand", "tier": "fragmented"}
    if score < 60:
        return {"label": "Balanced Demand", "tier": "balanced"}
    return {"label": "Concentrated Demand", "tier": "concentrated"}


def _scale_minmax(values: List[float]) -> List[float]:
    """Scale values to 0–100 within the candidate set; 50 if flat."""
    if not values:
        return []
    lo, hi = min(values), max(values)
    if hi <= lo:
        return [50.0] * len(values)
    return [((v - lo) / (hi - lo)) * 100.0 for v in values]


def _competition_penalty(entry_difficulty: str) -> float:
    """Entry score penalty from relative keyword competition."""
    level = (entry_difficulty or "Moderate").lower()
    if level in ("easy", "low"):
        return 0.0
    if level == "moderate":
        return 5.0
    return 10.0


def _find_most_undervalued_segment(
    segment_list: List[Dict[str, Any]],
    top_seg: Optional[Dict[str, Any]],
) -> Optional[Dict[str, Any]]:
    """
    Opportunity segments only: demand > revenue, 1–20% demand, not category leader.
    Score = (demand_share - revenue_share) * demand_share.
    """
    top_name = str(top_seg.get("segment", "")) if top_seg else ""
    best_score = -1.0
    best_seg: Optional[Dict[str, Any]] = None

    for seg in _named_segments(segment_list):
        seg_name = str(seg.get("segment", ""))
        if seg_name == top_name:
            continue
        demand = float(seg.get("demand_share") or 0)
        revenue = float(seg.get("revenue_share") or 0)
        if demand <= revenue or demand < 1.0 or demand > 20.0:
            continue
        opp_score = (demand - revenue) * demand
        if opp_score > best_score:
            best_score = opp_score
            best_seg = seg

    if not best_seg:
        return None

    gap = float(best_seg.get("demand_revenue_gap") or 0)
    return {
        "name": best_seg["segment"],
        "demand_share": best_seg["demand_share"],
        "revenue_share": best_seg["revenue_share"],
        "gap": gap,
        "undervalued_score": round(best_score, 2),
        "insight": (
            f"{best_seg['segment']} drives {best_seg['demand_share']}% of demand but only "
            f"{best_seg['revenue_share']}% of revenue — a secondary niche with room to capture "
            f"unmet buyer intent."
        ),
    }


def _entry_recommendation_reason(seg: Dict[str, Any], penalty: float) -> str:
    gap = float(seg.get("demand_revenue_gap") or 0)
    if gap > 0 and penalty <= 5:
        return "Strong monetization with manageable competition."
    if penalty <= 0:
        return "Favorable demand–revenue balance with low keyword competition."
    if gap < 0:
        return "Meaningful demand headroom with moderate competitive intensity."
    return "Balanced entry potential across demand, monetization, and competition."


def _recommended_entry_segment(
    segment_list: List[Dict[str, Any]],
    top_seg: Optional[Dict[str, Any]],
) -> Optional[Dict[str, Any]]:
    """Best launch segment excluding category leader and Other."""
    top_name = str(top_seg.get("segment", "")) if top_seg else ""
    candidates = [
        s for s in _named_segments(segment_list)
        if str(s.get("segment", "")) != top_name
    ]
    if not candidates:
        return None

    demands = [float(s.get("demand_share") or 0) for s in candidates]
    efficiencies = [float(s.get("revenue_efficiency_ratio") or 0) for s in candidates]
    revenues = [float(s.get("revenue_share") or 0) for s in candidates]
    gaps = [float(s.get("demand_revenue_gap") or 0) for s in candidates]

    d_norm = _scale_minmax(demands)
    e_norm = _scale_minmax(efficiencies)
    r_norm = _scale_minmax(revenues)
    g_norm = _scale_minmax(gaps)

    best_score = -999.0
    best_seg: Optional[Dict[str, Any]] = None
    for i, seg in enumerate(candidates):
        difficulty = str(seg.get("entry_difficulty") or "Moderate")
        penalty = _competition_penalty(difficulty)
        entry_score = (
            d_norm[i] * 0.35
            + e_norm[i] * 0.35
            + r_norm[i] * 0.20
            + g_norm[i] * 0.10
            - penalty
        )
        if entry_score > best_score:
            best_score = entry_score
            best_seg = seg

    if not best_seg:
        return None

    difficulty = str(best_seg.get("entry_difficulty") or "Moderate")
    competition_display = (
        "Low" if difficulty.lower() in ("easy", "low")
        else "High" if difficulty.lower() in ("hard", "high")
        else "Moderate"
    )
    gap = float(best_seg.get("demand_revenue_gap") or 0)
    penalty = _competition_penalty(difficulty)

    return {
        "name": best_seg["segment"],
        "demand_share": best_seg["demand_share"],
        "revenue_share": best_seg["revenue_share"],
        "gap": gap,
        "competition": competition_display,
        "entry_difficulty": difficulty,
        "entry_score": round(best_score, 2),
        "reason": _entry_recommendation_reason(best_seg, penalty),
    }


def _competition_ranked_segments(
    segment_list: List[Dict[str, Any]],
) -> Tuple[Optional[Dict[str, Any]], Optional[Dict[str, Any]]]:
    """Most / least competitive among named business segments (keyword density vs demand)."""
    named = [
        s for s in _named_segments(segment_list)
        if float(s.get("demand_share") or 0) >= 0.5
    ]
    if not named:
        return None, None
    most = max(named, key=lambda s: float(s.get("competition_index") or 0))
    least = min(named, key=lambda s: float(s.get("competition_index") or 0))
    return most, least


def _build_executive_insights(
    segment_list: List[Dict[str, Any]],
) -> Dict[str, Any]:
    """Generate What / Why / Action from actual named business segments only."""
    empty: Dict[str, Any] = {
        "what": "", "why": "", "action": "", "risk": "",
        "most_undervalued_segment": {},
        "best_monetized_segment": {},
        "most_competitive_segment": {},
        "least_competitive_segment": {},
    }
    if not segment_list:
        return empty

    top_seg = _top_named_segment(segment_list)
    if not top_seg:
        return empty

    share = float(top_seg.get("demand_share") or 0)
    name = str(top_seg.get("segment") or "Unknown")
    sv = int(top_seg.get("total_search_volume") or 0)
    max_named_share = max(
        float(s.get("demand_share") or 0) for s in _named_segments(segment_list)
    )

    what = (
        f"{name} is the largest demand segment, accounting for {share}% of "
        f"total category search volume ({sv:,} monthly searches)."
    )

    if max_named_share >= 50 or share >= 50:
        why = (
            f"Demand is concentrated in {name} ({share}% of category searches), "
            "indicating a dominant product type with clear purchase intent."
        )
    elif share >= 20:
        why = (
            "Buyers search with specific product-type intent rather than generic "
            "category terms, indicating mature, purchase-ready demand."
        )
    else:
        why = (
            "Demand is spread across multiple product types with no single segment "
            "above 20% share, indicating diversified buyer interests."
        )

    expand_candidates = []
    for seg in _named_segments(segment_list):
        seg_name = str(seg.get("segment", ""))
        if seg_name == name:
            continue
        demand = float(seg.get("demand_share") or 0)
        revenue = float(seg.get("revenue_share") or 0)
        difficulty = str(seg.get("entry_difficulty") or "Moderate").lower()
        if revenue > demand and difficulty not in ("high", "hard"):
            expand_candidates.append(seg_name)

    action_parts = [f"Use {name} as the primary demand anchor."]
    if expand_candidates:
        expanded_str = " and ".join(expand_candidates[:2]) if len(expand_candidates) <= 2 else f"{expand_candidates[0]} and {expand_candidates[1]}"
        action_parts.append(f"Expand into {expanded_str} where monetization exceeds demand share.")

    action_parts.append("Avoid fragmented niches until category authority is established.")
    action = " ".join(action_parts)

    named = _named_segments(segment_list)
    most_undervalued: Dict[str, Any] = {}
    best_monetized: Dict[str, Any] = {}
    undervalued_pick = _find_most_undervalued_segment(segment_list, top_seg)
    if undervalued_pick:
        most_undervalued = undervalued_pick
    if named:
        monetized = max(named, key=lambda s: float(s.get("demand_revenue_gap") or 0))
        best_monetized = {
            "name": monetized["segment"],
            "demand_share": monetized["demand_share"],
            "revenue_share": monetized["revenue_share"],
            "gap": monetized.get("demand_revenue_gap", 0),
            "insight": (
                f"{monetized['segment']} generates {monetized['revenue_share']}% of revenue "
                f"from {monetized['demand_share']}% of demand — this segment monetizes well."
            ),
        }

    most_comp, least_comp = _competition_ranked_segments(segment_list)
    most_competitive: Dict[str, Any] = {}
    least_competitive: Dict[str, Any] = {}
    if most_comp:
        most_competitive = {
            "name": most_comp["segment"],
            "demand_share": most_comp["demand_share"],
            "keyword_count": most_comp["keyword_count"],
            "competition_index": most_comp.get("competition_index"),
            "insight": (
                f"{most_comp['segment']} has the highest keyword competition "
                f"({most_comp['keyword_count']} keywords, {most_comp['demand_share']}% demand) — "
                "expect heavier SERP rivalry."
            ),
        }
    if least_comp:
        least_competitive = {
            "name": least_comp["segment"],
            "demand_share": least_comp["demand_share"],
            "keyword_count": least_comp["keyword_count"],
            "competition_index": least_comp.get("competition_index"),
            "entry_difficulty": least_comp.get("entry_difficulty", "Easy"),
            "insight": (
                f"{least_comp['segment']} has relatively low keyword density "
                f"({least_comp['keyword_count']} keywords, {least_comp['demand_share']}% demand) — "
                "potentially easier to win visibility."
            ),
        }

    risk_parts: List[str] = []
    concentration = _demand_concentration_score(segment_list)
    if max_named_share >= 50:
        risk_parts.append(
            f"Demand concentration in {name} ({share}%) creates dependency risk if buyer preferences shift."
        )
    if concentration >= 60:
        risk_parts.append(
            f"Category concentration score is {concentration}/100 — few segments dominate search intent."
        )
    other_pct = _other_share_pct(segment_list)
    if other_pct > 15:
        risk_parts.append(
            f"{other_pct:.0f}% of demand sits in 'Other' — offer coverage or keyword taxonomy gaps may hide risk."
        )
    if most_comp:
        risk_parts.append(
            f"{most_comp['segment']} is the most contested segment "
            f"({most_comp['keyword_count']} keywords) — expect higher CPC and SERP rivalry."
        )
    if undervalued_pick and float(undervalued_pick.get("gap", 0)) < -1:
        risk_parts.append(
            f"{undervalued_pick['name']} attracts demand but under-monetizes — conversion or positioning risk."
        )
    risk = (
        " ".join(risk_parts)
        if risk_parts
        else "No major concentration or competition risks flagged from current segment signals."
    )

    return {
        "what": what,
        "why": why,
        "action": action,
        "risk": risk,
        "most_undervalued_segment": most_undervalued,
        "best_monetized_segment": best_monetized,
        "most_competitive_segment": most_competitive,
        "least_competitive_segment": least_competitive,
    }


# ---------------------------------------------------------------------------
# Main engine function
# ---------------------------------------------------------------------------

def run(
    magnet_df: Optional[pd.DataFrame],
    blackbox_df: Optional[pd.DataFrame],
    top_n: int = 10,
) -> Dict[str, Any]:
    t0 = time.time()
    logger.info("Demand Strength engine started.")

    rows_magnet   = len(magnet_df)   if magnet_df   is not None else 0
    rows_blackbox = len(blackbox_df) if blackbox_df is not None else 0
    logger.info(f"Input rows — magnet={rows_magnet}, blackbox={rows_blackbox}")

    columns_used: List[str]      = []
    datasets_used: List[str]     = []
    metrics_available: List[str] = []
    metric_means: Dict[str, float] = {}
    numeric_cols_cleaned: List[str] = []

    # -----------------------------------------------------------------------
    # 1. Search Volume  (Magnet)
    # -----------------------------------------------------------------------
    sv_col: Optional[str] = None
    if magnet_df is not None and not magnet_df.empty:
        sv_col = find_column(magnet_df, _SEARCH_VOL_CANDIDATES)
        if sv_col:
            sv_clean, sv_stats = clean_numeric_series(magnet_df[sv_col], sv_col)
            logger.info(
                f"Search Volume '{sv_col}': "
                f"original={sv_stats['original_count']}, "
                f"cleaned={sv_stats['cleaned_count']}, "
                f"nan={sv_stats['nan_introduced']}"
            )
            sv_norm = min_max_normalize(sv_clean)
            sv_mean = float(sv_norm.mean(skipna=True))
            if not np.isnan(sv_mean):
                metrics_available.append("Search Volume")
                metric_means["Search Volume"] = round(sv_mean, 4)
                columns_used.append(sv_col)
                datasets_used.append("magnet")
                numeric_cols_cleaned.append(sv_col)

    # -----------------------------------------------------------------------
    # 2. Keyword Sales  (Magnet)
    # -----------------------------------------------------------------------
    kw_sales_col: Optional[str] = None
    if magnet_df is not None and not magnet_df.empty:
        kw_sales_col = find_column(magnet_df, _KW_SALES_CANDIDATES)
        if kw_sales_col:
            ks_clean, ks_stats = clean_numeric_series(magnet_df[kw_sales_col], kw_sales_col)
            logger.info(
                f"Keyword Sales '{kw_sales_col}': "
                f"original={ks_stats['original_count']}, "
                f"cleaned={ks_stats['cleaned_count']}, "
                f"nan={ks_stats['nan_introduced']}"
            )
            ks_norm = min_max_normalize(ks_clean)
            ks_mean = float(ks_norm.mean(skipna=True))
            if not np.isnan(ks_mean):
                metrics_available.append("Keyword Sales")
                metric_means["Keyword Sales"] = round(ks_mean, 4)
                columns_used.append(kw_sales_col)
                if "magnet" not in datasets_used:
                    datasets_used.append("magnet")
                numeric_cols_cleaned.append(kw_sales_col)

    # -----------------------------------------------------------------------
    # 3. ASIN Sales  (BlackBox)
    # -----------------------------------------------------------------------
    asin_sales_col: Optional[str] = None
    if blackbox_df is not None and not blackbox_df.empty:
        asin_sales_col = find_column(blackbox_df, _ASIN_SALES_CANDIDATES)
        if asin_sales_col:
            as_clean, as_stats = clean_numeric_series(blackbox_df[asin_sales_col], asin_sales_col)
            logger.info(
                f"ASIN Sales '{asin_sales_col}': "
                f"original={as_stats['original_count']}, "
                f"cleaned={as_stats['cleaned_count']}, "
                f"nan={as_stats['nan_introduced']}"
            )
            as_norm = min_max_normalize(as_clean)
            as_mean = float(as_norm.mean(skipna=True))
            if not np.isnan(as_mean):
                metrics_available.append("ASIN Sales")
                metric_means["ASIN Sales"] = round(as_mean, 4)
                columns_used.append(asin_sales_col)
                datasets_used.append("blackbox")
                numeric_cols_cleaned.append(asin_sales_col)

    # -----------------------------------------------------------------------
    # 4. Revenue  (BlackBox)
    # -----------------------------------------------------------------------
    revenue_col: Optional[str] = None
    if blackbox_df is not None and not blackbox_df.empty:
        revenue_col = find_column(blackbox_df, _REVENUE_CANDIDATES)
        if revenue_col:
            rev_clean, rev_stats = clean_numeric_series(blackbox_df[revenue_col], revenue_col)
            logger.info(
                f"Revenue '{revenue_col}': "
                f"original={rev_stats['original_count']}, "
                f"cleaned={rev_stats['cleaned_count']}, "
                f"nan={rev_stats['nan_introduced']}"
            )
            rev_norm = min_max_normalize(rev_clean)
            rev_mean = float(rev_norm.mean(skipna=True))
            if not np.isnan(rev_mean):
                metrics_available.append("Revenue")
                metric_means["Revenue"] = round(rev_mean, 4)
                columns_used.append(revenue_col)
                if "blackbox" not in datasets_used:
                    datasets_used.append("blackbox")
                numeric_cols_cleaned.append(revenue_col)

    # -----------------------------------------------------------------------
    # Guard: at least one metric required
    # -----------------------------------------------------------------------
    if not metrics_available:
        logger.warning("Demand Strength: no usable metric columns found.")
        return {
            "status": "error",
            "metric_name": "Demand Strength",
            "summary": "No usable metric columns found in uploaded datasets.",
            "datasets_used": [],
            "columns_used": [],
            "formula_used": "",
            "results": {},
            "validation": {
                "status": "failed",
                "message": "No usable metric columns found.",
                "missing_columns": (
                    _SEARCH_VOL_CANDIDATES[:1] + _KW_SALES_CANDIDATES[:1]
                    + _ASIN_SALES_CANDIDATES[:1] + _REVENUE_CANDIDATES[:1]
                ),
                "rows_before_cleaning": rows_magnet + rows_blackbox,
                "rows_after_cleaning": 0,
                "rows_skipped": rows_magnet + rows_blackbox,
                "numeric_columns_cleaned": [],
            },
            "processing_time_seconds": round(time.time() - t0, 3),
        }

    # -----------------------------------------------------------------------
    # 5. Market demand index (internal pillar score only — not shown as Demand Strength)
    # -----------------------------------------------------------------------
    score_sum = 0.0
    weight_sum = 0.0
    if "Search Volume" in metric_means:
        score_sum += metric_means["Search Volume"] * 0.50
        weight_sum += 0.50
    sales_score = 0.0
    sales_count = 0
    if "Keyword Sales" in metric_means:
        sales_score += metric_means["Keyword Sales"]
        sales_count += 1
    if "ASIN Sales" in metric_means:
        sales_score += metric_means["ASIN Sales"]
        sales_count += 1
    if sales_count > 0:
        score_sum += (sales_score / sales_count) * 0.35
        weight_sum += 0.35
    if "Revenue" in metric_means:
        score_sum += metric_means["Revenue"] * 0.15
        weight_sum += 0.15
    market_demand_index = round(score_sum / weight_sum, 2) if weight_sum > 0 else 0.0

    # -----------------------------------------------------------------------
    # 6. Top demand keyword + keyword list
    # -----------------------------------------------------------------------
    kw_col: Optional[str] = None
    top_keywords: List[Dict] = []
    top_demand_keyword: Dict[str, Any] = {}
    if magnet_df is not None and sv_col:
        kw_col = find_column(magnet_df, _KEYWORD_CANDIDATES)
        tmp = magnet_df.copy()
        sv_c, _ = clean_numeric_series(tmp[sv_col], sv_col)
        tmp["_sv"] = sv_c
        if kw_sales_col:
            ks_all, _ = clean_numeric_series(tmp[kw_sales_col], kw_sales_col)
            tmp["_ks"] = ks_all
        tmp = tmp.dropna(subset=["_sv"]).sort_values("_sv", ascending=False)
        total_sv = float(tmp["_sv"].sum())
        logger.info(f"Top keywords pool: {len(tmp)} rows with valid Search Volume")
        for _, row in tmp.head(top_n).iterrows():
            sv_val = float(row["_sv"])
            contrib = round((sv_val / total_sv) * 100.0, 2) if total_sv > 0 else 0.0
            entry: Dict[str, Any] = {
                "search_volume": _sv(sv_val),
                "demand_contribution": contrib,
            }
            if kw_col:
                entry["keyword"] = str(row[kw_col])
            if kw_sales_col and "_ks" in tmp.columns:
                entry["keyword_sales"] = _sv(row["_ks"])
            top_keywords.append(entry)

        if not tmp.empty:
            top_row = tmp.iloc[0]
            top_sv = float(top_row["_sv"])
            top_contrib = round((top_sv / total_sv) * 100.0, 2) if total_sv > 0 else 0.0
            if top_contrib >= 10:
                opp = "High"
            elif top_contrib >= 5:
                opp = "Medium"
            else:
                opp = "Low"
            rev_col_mag = find_column(magnet_df, _REVENUE_CANDIDATES)
            rev_est = None
            if rev_col_mag:
                rev_s, _ = clean_numeric_series(pd.Series([top_row[rev_col_mag]]), rev_col_mag)
                rev_est = _sv(rev_s.iloc[0])
            top_demand_keyword = {
                "keyword": str(top_row[kw_col]) if kw_col else "Unknown",
                "search_volume": int(top_sv) if top_sv == int(top_sv) else round(top_sv, 0),
                "demand_contribution": top_contrib,
                "revenue_opportunity": opp,
                "opportunity_level": opp,
                "estimated_keyword_revenue": rev_est,
            }

    # -----------------------------------------------------------------------
    # 7. Top demand products  (by ASIN Sales or Revenue)
    # -----------------------------------------------------------------------
    top_products: List[Dict] = []
    if blackbox_df is not None:
        sort_col = asin_sales_col or revenue_col
        if sort_col:
            title_col = find_column(blackbox_df, _TITLE_CANDIDATES)
            asin_col  = find_column(blackbox_df, _ASIN_CANDIDATES)
            tmp2 = blackbox_df.copy()
            sort_c, _ = clean_numeric_series(tmp2[sort_col], sort_col)
            tmp2["_sort"] = sort_c
            tmp2 = tmp2.dropna(subset=["_sort"]).sort_values("_sort", ascending=False)
            logger.info(f"Top products pool: {len(tmp2)} rows with valid {sort_col}")
            if revenue_col and revenue_col != sort_col:
                rev_all, _ = clean_numeric_series(tmp2[revenue_col], revenue_col)
                tmp2["_rev"] = rev_all
            for _, row in tmp2.head(top_n).iterrows():
                entry2: Dict[str, Any] = {sort_col: _sv(row["_sort"])}
                if title_col:
                    entry2["title"] = str(row[title_col])[:120]
                if asin_col:
                    entry2["asin"] = str(row[asin_col])
                if revenue_col and revenue_col != sort_col and "_rev" in tmp2.columns:
                    entry2["revenue"] = _sv(row["_rev"])
                top_products.append(entry2)

    # -----------------------------------------------------------------------
    # 8. Demand themes / segments
    # -----------------------------------------------------------------------
    segment_list: List[Dict[str, Any]] = []
    segmentation_method = "none"
    demand_concentration_score = 0.0
    top_demand_segment: Dict[str, Any] = {}
    executive_insights: Dict[str, Any] = {
        "what": "", "why": "", "action": "",
        "most_undervalued_segment": {}, "best_monetized_segment": {},
    }

    if magnet_df is not None and sv_col and kw_col:
        try:
            segment_list, segmentation_method = _extract_segments(
                magnet_df, sv_col, kw_sales_col, kw_col, top_n_segments=6
            )
        except Exception as exc:
            logger.exception("Demand segmentation failed, using fallback buckets: %s", exc)
            segment_list = _fallback_segment_list(magnet_df, sv_col, kw_sales_col, kw_col)
            segmentation_method = "fallback_after_error"

        if not segment_list:
            segment_list = _fallback_segment_list(magnet_df, sv_col, kw_sales_col, kw_col)
            segmentation_method = "fallback_empty"

        demand_concentration_score = _demand_concentration_score(segment_list)
        executive_insights = _build_executive_insights(segment_list)
        top_seg = _top_named_segment(segment_list)
        if top_seg:
            top_demand_segment = {
                "name": top_seg.get("segment") or "—",
                "demand_share": top_seg.get("demand_share", 0),
                "keyword_count": top_seg.get("keyword_count", 0),
                "total_search_volume": top_seg.get("total_search_volume", 0),
            }
        logger.info(
            "Demand segments: %s, method=%s, concentration=%s, top_segment=%s",
            len(segment_list),
            segmentation_method,
            demand_concentration_score,
            top_demand_segment.get("name", "n/a"),
        )

    top_revenue_segment: Dict[str, Any] = {}
    revenue_efficiency_leader: Dict[str, Any] = {}
    most_competitive_segment: Dict[str, Any] = {}
    least_competitive_segment: Dict[str, Any] = {}
    named_segments = _named_segments(segment_list) if segment_list else []
    eff_leader = _revenue_efficiency_leader(segment_list) if segment_list else None
    if eff_leader:
        revenue_efficiency_leader = {
            "name": eff_leader["segment"],
            "demand_share": eff_leader["demand_share"],
            "revenue_share": eff_leader["revenue_share"],
            "revenue_efficiency_ratio": eff_leader.get("revenue_efficiency_ratio"),
            "keyword_count": eff_leader["keyword_count"],
            "total_search_volume": eff_leader["total_search_volume"],
        }
        top_revenue_segment = revenue_efficiency_leader
    elif named_segments:
        revenue_seg = max(named_segments, key=lambda s: float(s.get("revenue_share") or 0))
        top_revenue_segment = {
            "name": revenue_seg["segment"],
            "demand_share": revenue_seg["demand_share"],
            "revenue_share": revenue_seg["revenue_share"],
            "keyword_count": revenue_seg["keyword_count"],
            "total_search_volume": revenue_seg["total_search_volume"],
        }
    most_competitive_segment = executive_insights.get("most_competitive_segment", {})
    least_competitive_segment = executive_insights.get("least_competitive_segment", {})
    concentration_meta = _demand_concentration_meta(demand_concentration_score)
    top_seg_for_entry = _top_named_segment(segment_list) if segment_list else None
    recommended_entry_pick = (
        _recommended_entry_segment(segment_list, top_seg_for_entry)
        if segment_list
        else None
    )
    recommended_entry_segment: Dict[str, Any] = recommended_entry_pick or {}

    # -----------------------------------------------------------------------
    # 9. Interpretation (percentile-relative to score distribution)
    # -----------------------------------------------------------------------
    if top_demand_segment:
        interpretation = (
            f"{top_demand_segment.get('name', '')} leads demand with "
            f"{top_demand_segment.get('demand_share', 0)}% of category search volume. "
            f"Concentration score: {demand_concentration_score}/100."
        )
    elif market_demand_index >= 60:
        interpretation = "Market shows concentrated search demand across tracked keywords."
    else:
        interpretation = "Limited search demand signals in uploaded keyword data."

    elapsed = round(time.time() - t0, 3)
    logger.info(
        "Demand Intelligence complete: market_demand_index=%s, top_keyword=%s, elapsed=%ss",
        market_demand_index,
        top_demand_keyword.get("keyword", "n/a"),
        elapsed,
    )

    return {
        "status": "success",
        "metric_name": "Demand Intelligence",
        "summary": interpretation,
        "datasets_used": list(dict.fromkeys(datasets_used)),
        "columns_used": list(dict.fromkeys(columns_used)),
        "formula_used": (
            "Demand Concentration = HHI of segment search-volume shares; "
            "Segments = semantic business-category classification (no phrase clustering); "
            "Competition Index = keyword_count / demand_share; "
            "Market Demand Index (report pillar only) from weighted normalized metrics."
        ),
        "results": {
            "market_demand_index": market_demand_index,
            "top_demand_keyword": top_demand_keyword,
            "metrics_contributing": metric_means,
            "metrics_available": metrics_available,
            "top_demand_keywords": top_keywords,
            "top_demand_products": top_products,
            "demand_concentration_score": demand_concentration_score,
            "demand_concentration_label": concentration_meta.get("label", ""),
            "demand_concentration_tier": concentration_meta.get("tier", ""),
            "recommended_entry_segment": recommended_entry_segment,
            "top_demand_segment": top_demand_segment,
            "top_revenue_segment": top_revenue_segment,
            "revenue_efficiency_leader": revenue_efficiency_leader,
            "most_competitive_segment": most_competitive_segment,
            "least_competitive_segment": least_competitive_segment,
            "most_undervalued_segment": executive_insights.get("most_undervalued_segment", {}),
            "best_monetized_segment": executive_insights.get("best_monetized_segment", {}),
            "demand_distribution": segment_list,
            "demand_opportunity_clusters": segment_list,
            "executive_insights": executive_insights,
            "segmentation_method": segmentation_method,
        },
        "validation": {
            "status": "passed",
            "metrics_found": len(metrics_available),
            "rows_before_cleaning": rows_magnet + rows_blackbox,
            "rows_after_cleaning": rows_magnet + rows_blackbox,
            "rows_skipped": 0,
            "numeric_columns_cleaned": numeric_cols_cleaned,
            "rows_magnet": rows_magnet,
            "rows_blackbox": rows_blackbox,
        },
        "processing_time_seconds": elapsed,
    }


# ---------------------------------------------------------------------------
# Helper
# ---------------------------------------------------------------------------

def _sv(v: Any) -> Any:
    """Convert numpy scalars / NaN to JSON-safe Python types."""
    if v is None:
        return None
    if pd.isna(v):
        return None
    if isinstance(v, np.integer):
        return int(v)
    if isinstance(v, (np.floating, float)):
        return round(float(v), 4)
    return v
