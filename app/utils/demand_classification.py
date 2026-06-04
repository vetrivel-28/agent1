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
