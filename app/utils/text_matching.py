"""
Text Matching Utility
=====================
Deterministic, dataset-driven text similarity functions.
NO AI, NO embeddings, NO LLMs.

Functions
---------
clean_text(text)            — lowercase, strip punctuation, normalise whitespace
tokenize_text(text)         — split into meaningful tokens, remove stopwords
fuzzy_match_score(a, b)     — character-level similarity 0-100
keyword_overlap_score(a, b) — token-overlap Jaccard similarity 0-100
best_keyword_match(keyword, corpus) — find best match in a list of strings
"""
from __future__ import annotations

import re
import string
from functools import lru_cache
from typing import FrozenSet, List, Optional, Tuple

# ---------------------------------------------------------------------------
# Stopwords — common English words that add no matching signal
# ---------------------------------------------------------------------------
_STOPWORDS = frozenset({
    "a", "an", "the", "and", "or", "but", "in", "on", "at", "to", "for",
    "of", "with", "by", "from", "as", "is", "was", "are", "were", "be",
    "been", "being", "have", "has", "had", "do", "does", "did", "will",
    "would", "could", "should", "may", "might", "shall", "can", "need",
    "it", "its", "this", "that", "these", "those", "i", "you", "he", "she",
    "we", "they", "my", "your", "his", "her", "our", "their", "what",
    "which", "who", "whom", "when", "where", "why", "how", "all", "each",
    "every", "both", "few", "more", "most", "other", "some", "such", "no",
    "not", "only", "same", "so", "than", "too", "very", "just", "set",
    "pack", "piece", "pcs", "pc", "lot", "new", "best", "top", "great",
    "good", "high", "low", "large", "small", "big", "extra", "super",
    "ultra", "premium", "luxury", "quality", "soft", "hard", "light",
    "heavy", "long", "short", "wide", "narrow", "thick", "thin",
})


# ---------------------------------------------------------------------------
# Core text cleaning
# ---------------------------------------------------------------------------

def clean_text(text: str) -> str:
    """
    Lowercase, remove punctuation, collapse whitespace.
    Returns empty string for None/non-string input.
    """
    if not isinstance(text, str) or not text.strip():
        return ""
    return _clean_text_cached(text)


@lru_cache(maxsize=8192)
def _clean_text_cached(text: str) -> str:
    # Lowercase
    t = text.lower()
    # Remove punctuation except hyphens (keep "100%" → "100", "t-shirt" → "t shirt")
    t = t.replace("-", " ").replace("/", " ").replace("&", " and ")
    t = t.translate(str.maketrans("", "", string.punctuation))
    # Collapse whitespace
    t = re.sub(r"\s+", " ", t).strip()
    return t


def tokenize_text(text: str, remove_stopwords: bool = True) -> List[str]:
    """
    Clean and split text into tokens.
    Optionally removes stopwords.
    Returns list of non-empty tokens with length >= 2.
    """
    cleaned = clean_text(text)
    if not cleaned:
        return []
    return list(_tokenize_cached(cleaned, remove_stopwords))


@lru_cache(maxsize=8192)
def _tokenize_cached(cleaned: str, remove_stopwords: bool = True) -> tuple:
    tokens = cleaned.split()
    tokens = [t for t in tokens if len(t) >= 2]
    if remove_stopwords:
        tokens = [t for t in tokens if t not in _STOPWORDS]
    return tuple(tokens)


# ---------------------------------------------------------------------------
# Similarity scores
# ---------------------------------------------------------------------------

def fuzzy_match_score(a: str, b: str) -> float:
    """
    Character-level similarity using longest common subsequence ratio.
    Returns 0-100 float.
    No external libraries — pure Python.
    """
    a_clean = clean_text(a)
    b_clean = clean_text(b)

    if not a_clean or not b_clean:
        return 0.0
    if a_clean == b_clean:
        return 100.0

    # Bigram overlap (fast, deterministic, no deps)
    def bigrams(s: str) -> set:
        return {s[i:i+2] for i in range(len(s) - 1)}

    bg_a = bigrams(a_clean)
    bg_b = bigrams(b_clean)

    if not bg_a or not bg_b:
        return 0.0

    intersection = len(bg_a & bg_b)
    union = len(bg_a | bg_b)
    score = (intersection / union) * 100.0
    return round(score, 2)


def keyword_overlap_score(a: str, b: str) -> float:
    """
    Token-level Jaccard similarity.
    Returns 0-100 float.
    """
    tokens_a = set(tokenize_text(a))
    tokens_b = set(tokenize_text(b))

    if not tokens_a or not tokens_b:
        return 0.0

    intersection = len(tokens_a & tokens_b)
    union = len(tokens_a | tokens_b)

    if union == 0:
        return 0.0

    return round((intersection / union) * 100.0, 2)


@lru_cache(maxsize=16384)
def combined_similarity(a: str, b: str, fuzzy_weight: float = 0.4, overlap_weight: float = 0.6) -> float:
    """
    Weighted combination of fuzzy_match_score and keyword_overlap_score.
    Returns 0-100 float.
    """
    fuzzy  = fuzzy_match_score(a, b)
    overlap = keyword_overlap_score(a, b)
    return round(fuzzy * fuzzy_weight + overlap * overlap_weight, 2)


def best_keyword_match(
    keyword: str,
    corpus: List[str],
    min_score: float = 15.0,
) -> Tuple[Optional[str], float]:
    """
    Find the best matching string in corpus for the given keyword.

    Parameters
    ----------
    keyword   : query string
    corpus    : list of candidate strings
    min_score : minimum combined_similarity to count as a match

    Returns
    -------
    (best_match_string, score) or (None, 0.0) if no match above threshold
    """
    if not keyword or not corpus:
        return None, 0.0

    best_text  = None
    best_score = 0.0

    for candidate in corpus:
        score = combined_similarity(keyword, candidate)
        if score > best_score:
            best_score = score
            best_text  = candidate

    if best_score < min_score:
        return None, 0.0

    return best_text, best_score


def contains_any_token(text: str, token_set: frozenset) -> bool:
    """
    Return True if any token from token_set appears in the tokenized text.
    Fast O(n) check for bulk filtering.
    """
    tokens = set(tokenize_text(text))
    return bool(tokens & token_set)
