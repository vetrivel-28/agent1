"""
Deterministic keyword classification helpers for Demand Intelligence.
All logic is dataset-derived — no hardcoded category themes.
"""
from __future__ import annotations

import re
from collections import Counter
from typing import Any, Dict, List, Optional, Set, Tuple

STOP_WORDS = {
    "for", "and", "the", "with", "in", "of", "to", "a", "on", "at", "by", "an",
    "is", "it", "as", "or", "be", "from", "that", "this", "your", "best", "top",
    "para", "de", "el", "la", "los", "las", "un", "una",
}

GENERIC_THEME_WORDS = {
    "towel", "towels", "set", "sets", "best", "product", "products", "item",
    "items", "bag", "bags", "bottle", "bottles", "buy", "new", "sale", "cheap",
    "good", "great", "size", "pack", "kit", "accessory", "accessories",
}

PLURAL_MAP = {
    "towels": "towel", "bags": "bag", "bottles": "bottle", "sets": "set",
    "products": "product", "items": "item", "accessories": "accessory",
}


def normalize_text(text: str) -> str:
    if not text or not isinstance(text, str):
        return ""
    t = text.lower().strip()
    t = re.sub(r"[^\w\s]", " ", t)
    t = re.sub(r"\s+", " ", t).strip()
    return t


def tokenize(keyword: str, remove_stopwords: bool = True) -> List[str]:
    words = re.findall(r"\b[a-z]{2,}\b", normalize_text(keyword))
    if remove_stopwords:
        words = [w for w in words if w not in STOP_WORDS]
    return words


def singularize_word(word: str) -> str:
    if word in PLURAL_MAP:
        return PLURAL_MAP[word]
    if word.endswith("ies") and len(word) > 4:
        return word[:-3] + "y"
    if word.endswith("es") and len(word) > 3:
        return word[:-2]
    if word.endswith("s") and len(word) > 3 and not word.endswith("ss"):
        return word[:-1]
    return word


def normalize_tokens(tokens: List[str]) -> List[str]:
    return [singularize_word(t) for t in tokens]


def is_generic_theme(phrase: str, seed_keyword: Optional[str] = None) -> bool:
    if not phrase or not phrase.strip():
        return True
    norm = normalize_text(phrase)
    words = norm.split()
    if len(words) == 0:
        return True
    if all(w in GENERIC_THEME_WORDS for w in words):
        return True
    if len(words) == 1 and words[0] in GENERIC_THEME_WORDS:
        return True
    if seed_keyword:
        seed_norm = normalize_text(seed_keyword)
        if norm == seed_norm or norm in seed_norm.split():
            if len(words) <= 2:
                return True
    return False


def extract_meaningful_phrases(keyword: str) -> List[str]:
    """Extract 2-3 word phrases preferentially from keyword text."""
    tokens = normalize_tokens(tokenize(keyword))
    if not tokens:
        return []
    phrases: List[str] = []
    if len(tokens) >= 3:
        for i in range(len(tokens) - 2):
            phrases.append(" ".join(tokens[i : i + 3]))
    if len(tokens) >= 2:
        for i in range(len(tokens) - 1):
            phrases.append(" ".join(tokens[i : i + 2]))
    if len(tokens) == 1 and tokens[0] not in GENERIC_THEME_WORDS:
        phrases.append(tokens[0])
    return phrases


def phrase_similarity(a: str, b: str) -> float:
    ta = set(normalize_text(a).split())
    tb = set(normalize_text(b).split())
    if not ta or not tb:
        return 0.0
    return len(ta & tb) / len(ta | tb)


def normalize_theme_display(name: str) -> str:
    return " ".join(w.capitalize() for w in normalize_text(name).split())


def find_near_duplicate_themes(themes: List[str]) -> List[Dict[str, Any]]:
    """Flag possible duplicate themes without auto-merging."""
    flags = []
    seen: Set[Tuple[str, str]] = set()
    for i, a in enumerate(themes):
        for b in themes[i + 1 :]:
            if a == b or (a, b) in seen:
                continue
            sim = phrase_similarity(a, b)
            if sim >= 0.6:
                pair = tuple(sorted([a, b]))
                if pair not in seen:
                    seen.add(pair)
                    flags.append({
                        "theme_a": a,
                        "theme_b": b,
                        "similarity": round(sim, 2),
                        "warning": "Possible duplicate theme",
                    })
    return flags


def group_unclassified_keywords(
    keywords: List[Dict[str, Any]],
    total_sv: float,
    seed_keyword: Optional[str] = None,
    max_groups: int = 10,
) -> List[Dict[str, Any]]:
    """
    Deterministically group unclassified keywords by shared phrases.
    keywords: list of {keyword, search_volume, reason_unclassified}
    """
    phrase_agg: Dict[str, Dict[str, Any]] = {}

    for item in keywords:
        kw = item.get("keyword", "")
        sv = float(item.get("search_volume", 0) or 0)
        if sv <= 0:
            continue
        for phrase in extract_meaningful_phrases(kw):
            if is_generic_theme(phrase, seed_keyword):
                continue
            key = phrase
            if key not in phrase_agg:
                phrase_agg[key] = {
                    "phrase": phrase,
                    "search_volume": 0.0,
                    "keywords": [],
                    "keyword_set": set(),
                }
            phrase_agg[key]["search_volume"] += sv
            kw_lower = normalize_text(kw)
            if kw_lower not in phrase_agg[key]["keyword_set"]:
                phrase_agg[key]["keyword_set"].add(kw_lower)
                phrase_agg[key]["keywords"].append(
                    {"keyword": kw, "search_volume": int(sv)}
                )

    groups = []
    min_sv_threshold = total_sv * 0.01 if total_sv > 0 else 0

    for data in phrase_agg.values():
        kw_count = len(data["keyword_set"])
        sv = data["search_volume"]
        if kw_count < 3 and sv < min_sv_threshold:
            continue
        data["keywords"].sort(key=lambda x: x["search_volume"], reverse=True)
        top_kws = data["keywords"][:5]
        matched_sv = sum(k["search_volume"] for k in data["keywords"])
        phrase = data["phrase"]
        theme_name = normalize_theme_display(phrase)
        consistency = kw_count / max(len(data["keywords"]), 1)
        vol_share = (matched_sv / total_sv * 100) if total_sv > 0 else 0
        derived_confidence = min(
            100.0,
            round(40 + consistency * 20 + min(vol_share, 30) + min(kw_count, 10) * 2, 1),
        )
        groups.append({
            "suggested_theme": theme_name,
            "total_search_volume": int(matched_sv),
            "keyword_count": kw_count,
            "top_keywords": top_kws,
            "reason_suggested": (
                f"{kw_count} unclassified keywords share phrase '{phrase}' "
                f"representing {vol_share:.1f}% of total demand"
            ),
            "source": "Derived From Keyword Text",
            "derived_confidence": derived_confidence,
            "suggested_action": "Add classification rule or map to existing theme",
        })

    groups.sort(key=lambda g: g["total_search_volume"], reverse=True)
    return groups[:max_groups]


def build_unclassified_keyword_table(
    keywords: List[Dict[str, Any]],
    limit: int = 10,
) -> List[Dict[str, Any]]:
    rows = []
    for item in sorted(keywords, key=lambda x: float(x.get("search_volume", 0)), reverse=True):
        rows.append({
            "keyword": item.get("keyword", ""),
            "search_volume": int(item.get("search_volume", 0)),
            "suggested_theme": item.get("suggested_theme", "—"),
            "reason_unclassified": item.get("reason_unclassified", "No theme/classification value"),
            "suggested_action": item.get("suggested_action", "Review classification"),
        })
    return rows[:limit]


def apply_enhanced_classification(
    assignments: List[str],
    keywords: List[str],
    search_volumes: List[float],
    existing_themes: List[str],
    seed_keyword: Optional[str] = None,
) -> Tuple[List[str], List[str], bool]:
    """
    For keywords assigned 'Other', try deterministic phrase extraction.
    Returns (new_assignments, newly_created_themes, improved).
    """
    new_assignments = list(assignments)
    new_themes: List[str] = []
    total_sv = sum(search_volumes) or 1
    min_sv_threshold = total_sv * 0.01

    other_indices = [i for i, a in enumerate(assignments) if a == "Other"]
    if not other_indices:
        return new_assignments, [], False

    phrase_scores: Counter = Counter()
    phrase_keywords: Dict[str, List[int]] = {}

    for i in other_indices:
        kw = keywords[i]
        sv = search_volumes[i]
        for phrase in extract_meaningful_phrases(kw):
            if is_generic_theme(phrase, seed_keyword):
                continue
            phrase_scores[phrase] += sv
            phrase_keywords.setdefault(phrase, []).append(i)

    improved = False
    used_phrases: Set[str] = set()

    for phrase, score in phrase_scores.most_common(30):
        if phrase in used_phrases:
            continue
        indices = phrase_keywords.get(phrase, [])
        if len(indices) < 3 and score < min_sv_threshold:
            continue

        mapped_theme = None
        for existing in existing_themes:
            if existing == "Other":
                continue
            if phrase_similarity(phrase, existing) >= 0.6:
                mapped_theme = existing
                break

        if mapped_theme:
            target = mapped_theme
        else:
            target = normalize_theme_display(phrase)
            if target not in existing_themes and target not in new_themes:
                new_themes.append(target)

        for i in indices:
            if new_assignments[i] == "Other":
                new_assignments[i] = target
                improved = True
        used_phrases.add(phrase)

    return new_assignments, new_themes, improved


def compute_row_confidence(segment: Dict[str, Any], has_revenue: bool) -> float:
    required = ["segment", "total_search_volume", "demand_share", "keyword_count"]
    if has_revenue:
        required.extend(["revenue_share"])
    if segment.get("segment") != "Other":
        required.append("competition_index")
    found = 0
    for f in required:
        val = segment.get(f)
        if val is not None and val != "" and not (isinstance(val, (int, float)) and val == 0 and f == "revenue_share"):
            if f == "keyword_count" and val == 0:
                continue
            found += 1
    kws = segment.get("keywords", [])
    if kws and len(kws) > 0:
        found += 1
    total_required = len(required) + 1
    return round((found / total_required) * 100, 1) if total_required > 0 else 0.0


def qualification_label(base: str, confidence: float) -> str:
    if confidence >= 80:
        return base
    if confidence >= 50:
        return f"{base} — Medium Confidence"
    return f"Directional {base}"


# Labels that are classification types or broad buckets — not strategic themes
CLASSIFICATION_TYPE_LABELS = {
    "complement", "substitute", "direct", "generic", "other", "misc",
    "unknown", "unclassified", "miscellaneous", "broad", "misc.",
}

BROAD_BUCKET_LABELS = CLASSIFICATION_TYPE_LABELS | {
    "generic", "other", "misc", "unknown", "unclassified", "broad demand",
}


def is_classification_type_only(name: str) -> bool:
    norm = normalize_text(name)
    if not norm:
        return True
    if norm in CLASSIFICATION_TYPE_LABELS:
        return True
    words = norm.split()
    return len(words) == 1 and words[0] in CLASSIFICATION_TYPE_LABELS


def is_broad_bucket(name: str) -> bool:
    norm = normalize_text(name)
    if not norm:
        return True
    if norm in BROAD_BUCKET_LABELS:
        return True
    if norm.startswith("generic"):
        return True
    return is_classification_type_only(name)


def derive_dominant_phrase_from_keywords(
    keywords: List[Dict[str, Any]],
    total_sv: float,
) -> Optional[str]:
    """Pick highest-SV meaningful phrase from keyword text in a segment."""
    phrase_scores: Counter = Counter()
    for item in keywords:
        sv = float(item.get("search_volume", 0) or 0)
        kw = str(item.get("keyword", ""))
        for phrase in extract_meaningful_phrases(kw):
            if is_generic_theme(phrase):
                continue
            phrase_scores[phrase] += sv
    if not phrase_scores:
        return None
    best_phrase, score = phrase_scores.most_common(1)[0]
    kw_count = sum(
        1 for item in keywords
        if best_phrase in normalize_text(str(item.get("keyword", "")))
    )
    min_sv = total_sv * 0.01 if total_sv > 0 else 0
    if kw_count < 3 and score < min_sv:
        return None
    return normalize_theme_display(best_phrase)


def compute_theme_specificity_score(segment: Dict[str, Any], total_sv: float) -> float:
    display = str(segment.get("display_segment") or segment.get("segment", ""))
    keywords = segment.get("keywords") or []
    word_count = len(normalize_text(display).split())
    if word_count >= 3:
        phrase_spec = 90.0
    elif word_count == 2:
        phrase_spec = 72.0
    elif word_count == 1 and not is_broad_bucket(display):
        phrase_spec = 35.0
    else:
        phrase_spec = 12.0

    dominant = normalize_text(display)
    matching = sum(
        1 for k in keywords
        if dominant and dominant in normalize_text(str(k.get("keyword", "")))
    )
    consistency = (matching / len(keywords) * 100.0) if keywords else 0.0

    theme_sv = float(segment.get("total_search_volume", 0) or 1)
    top_sv = sum(float(k.get("search_volume", 0) or 0) for k in keywords[:5])
    vol_conc = min(100.0, (top_sv / theme_sv) * 100.0) if theme_sv > 0 else 0.0

    non_generic = 0.0 if is_broad_bucket(display) or is_classification_type_only(display) else 100.0

    score = (
        0.40 * phrase_spec
        + 0.30 * consistency
        + 0.20 * vol_conc
        + 0.10 * non_generic
    )
    return round(min(100.0, max(0.0, score)), 1)


def enrich_segment_strategic_metadata(
    segment: Dict[str, Any],
    total_sv: float,
) -> Dict[str, Any]:
    """Add display_segment, theme_type, specificity, eligibility fields."""
    raw_name = str(segment.get("segment", ""))
    keywords = segment.get("keywords") or []
    exclusion_reason = None
    theme_type = "Specific"
    display_name = raw_name

    if raw_name == "Other":
        theme_type = "Broad"
        exclusion_reason = "Unclassified bucket (Other)"
    elif is_broad_bucket(raw_name) or is_classification_type_only(raw_name):
        derived = derive_dominant_phrase_from_keywords(keywords, total_sv)
        if derived and not is_broad_bucket(derived):
            display_name = derived
            theme_type = "Derived"
            if is_classification_type_only(raw_name):
                segment["derived_from_classification"] = raw_name
        elif is_classification_type_only(raw_name):
            theme_type = "Classification Type"
            exclusion_reason = (
                f"'{raw_name}' is a classification type, not a specific product theme"
            )
        else:
            theme_type = "Broad"
            exclusion_reason = f"'{raw_name}' is a broad/generic bucket — needs sub-theme extraction"
    else:
        display_name = normalize_theme_display(raw_name)

    segment["segment"] = raw_name
    segment["display_segment"] = display_name
    segment["theme_type"] = theme_type
    segment["theme_specificity_score"] = compute_theme_specificity_score(
        {**segment, "display_segment": display_name}, total_sv
    )

    eligible, elig_reason = is_strategic_eligible(segment, total_sv, exclusion_reason)
    segment["strategic_eligible"] = eligible
    segment["exclusion_reason"] = elig_reason if not eligible else None
    return segment


def is_strategic_eligible(
    segment: Dict[str, Any],
    total_sv: float,
    preset_reason: Optional[str] = None,
) -> Tuple[bool, str]:
    if preset_reason:
        return False, preset_reason
    if segment.get("segment") == "Other":
        return False, "Unclassified bucket (Other)"
    if segment.get("theme_type") in ("Broad", "Classification Type"):
        return False, segment.get("exclusion_reason") or "Non-specific theme bucket"
    spec = float(segment.get("theme_specificity_score", 0))
    if spec < 50:
        return False, f"Theme specificity {spec:.0f}% is below minimum 50%"
    count = int(segment.get("keyword_count", 0))
    sv = float(segment.get("total_search_volume", 0))
    min_sv = total_sv * 0.01 if total_sv > 0 else 0
    if count < 3 and sv < min_sv:
        return False, "Requires ≥3 keywords or ≥1% of total search volume"
    if not segment.get("keywords"):
        return False, "No supporting keywords available"
    return True, ""


def compute_strategic_confidence(
    segment: Dict[str, Any],
    data_completeness: float,
) -> float:
    """Strategic Confidence = 50% data + 30% specificity + 20% evidence quality."""
    spec = float(segment.get("theme_specificity_score", 0))
    kws = segment.get("keywords") or []
    evidence_pts = 0.0
    if kws:
        evidence_pts += 40
    if len(kws) >= 3:
        evidence_pts += 30
    if segment.get("total_search_volume", 0) > 0:
        evidence_pts += 30
    evidence_quality = min(100.0, evidence_pts)
    strategic = 0.50 * data_completeness + 0.30 * spec + 0.20 * evidence_quality
    if segment.get("theme_type") in ("Broad", "Classification Type"):
        strategic = min(strategic, 35.0)
    return round(min(100.0, strategic), 1)


def build_theme_quality_summary(
    segments: List[Dict[str, Any]],
    total_sv: float,
) -> Dict[str, Any]:
    non_other = [s for s in segments if s.get("segment") != "Other"]
    broad = [s for s in non_other if s.get("theme_type") in ("Broad", "Classification Type")]
    specific = [s for s in non_other if s.get("theme_type") in ("Specific", "Derived")]
    eligible = [s for s in non_other if s.get("strategic_eligible")]
    excluded = [s for s in non_other if not s.get("strategic_eligible")]

    generic_seg = next(
        (s for s in segments if normalize_text(s.get("segment", "")) == "generic"),
        None,
    )
    generic_share = float(generic_seg["demand_share"]) if generic_seg else 0.0

    detected_themes = len(non_other)
    kpi_ready_ratio = len(eligible) / max(detected_themes, 1)
    specific_ratio = len(specific) / max(detected_themes, 1)
    non_excluded_ratio = 1 - (len(excluded) / max(detected_themes, 1))
    inverse_generic = 1 - (generic_share / 100.0)

    theme_quality_score = round(
        40 * kpi_ready_ratio +
        30 * specific_ratio +
        20 * non_excluded_ratio +
        10 * inverse_generic,
        1
    )

    if theme_quality_score >= 75:
        confidence_label = "Strong theme quality"
    elif theme_quality_score >= 50:
        confidence_label = "Moderate theme quality"
    else:
        confidence_label = "Weak theme quality"

    insights = []
    if generic_share >= 50:
        insights.append(f"Most demand is generic. {generic_share:.1f}% of keyword demand comes from broad category-level searches, so buyers may still be exploring rather than searching for a specific product type.")
    elif generic_share < 20 and detected_themes > 0:
        insights.append(f"Demand is highly specific. Only {generic_share:.1f}% of demand is generic, indicating strong buyer-intent clusters across the market.")
    
    if specific_ratio >= 0.6:
        insights.append(f"The market has usable segmentation. {len(specific)} out of {detected_themes} detected themes are specific, meaning there are clear keyword groups that can support targeted listing optimization, PPC campaigns, and product positioning.")
    elif specific_ratio <= 0.3 and detected_themes > 0:
        insights.append(f"Demand is less differentiated. Only {len(specific)} out of {detected_themes} themes are specific, meaning keyword segmentation needs improvement before major product decisions.")

    if kpi_ready_ratio >= 0.7:
        insights.append(f"Themes are strong enough for KPI scoring. With {len(eligible)} KPI-ready themes, the dashboard can confidently calculate demand strength.")
    elif kpi_ready_ratio <= 0.4 and detected_themes > 0:
        insights.append(f"Only {len(eligible)} themes are strong enough for KPI scoring. This means dashboard confidence is limited and decisions should be made carefully.")

    if len(excluded) > 0:
        insights.append(f"Do not base strategy on excluded themes. {len(excluded)} themes were excluded from scoring and should be treated as weak/noisy demand signals until more data supports them.")

    if not insights and detected_themes == 0:
        insights.append("Insufficient data. No themes were detected to generate insights.")

    if theme_quality_score >= 75:
        recommended_action = "Prioritize the KPI-ready themes for product positioning and paid campaigns. Use generic terms for visibility, but avoid relying only on broad keywords because they have weaker buyer intent."
    elif theme_quality_score >= 50:
        recommended_action = "Use specific themes for targeted listings and content, but avoid spending heavily on broad/generic terms. Refine dataset quality if possible."
    else:
        recommended_action = "Do not rely heavily on these themes for strategy. Improve dataset quality and keyword segmentation before executing major product decisions."

    return {
        "detected_demand_themes": detected_themes,
        "specific_buyer_intent_themes": len(specific),
        "broad_generic_themes": len(broad),
        "themes_used_for_scoring": len(eligible),
        "themes_excluded_from_scoring": len(excluded),
        "generic_demand_share_pct": round(generic_share, 2),
        "confidence_score": theme_quality_score,
        "confidence_label": confidence_label,
        "insights": insights,
        "recommended_action": recommended_action,
        "ratios_used": {
            "kpi_ready_ratio": round(kpi_ready_ratio, 3),
            "specific_ratio": round(specific_ratio, 3),
            "non_excluded_ratio": round(non_excluded_ratio, 3),
            "inverse_generic": round(inverse_generic, 3),
        },
        "formula": "40% * KPI-ready ratio + 30% * specific ratio + 20% * non-excluded ratio + 10% * inverse generic",
        "dataset_scope": "Demand classification dataset",
        "excluded_theme_details": [
            {
                "segment": s.get("segment"),
                "display_segment": s.get("display_segment"),
                "reason": s.get("exclusion_reason"),
            }
            for s in excluded[:15]
        ],
    }


def get_generic_bucket_breakdown(
    segments: List[Dict[str, Any]],
    unclassified_groups: List[Dict[str, Any]],
    total_sv: float,
) -> Dict[str, Any]:
    generic = next(
        (s for s in segments if normalize_text(s.get("segment", "")) == "generic"),
        None,
    )
    if not generic and not unclassified_groups:
        return {}
    return {
        "generic_demand_share_pct": generic["demand_share"] if generic else 0,
        "generic_keyword_count": generic["keyword_count"] if generic else 0,
        "generic_search_volume": generic["total_search_volume"] if generic else 0,
        "suggested_sub_themes": unclassified_groups[:10],
        "note": (
            "Broad/generic demand should be split using deterministic phrase grouping "
            "before making strategic recommendations."
        ),
    }
