from collections import Counter
import re
from typing import List, Dict, Tuple

STOP_WORDS = {"for", "and", "the", "with", "in", "of", "to", "a", "on", "para", "de", "or"}

def extract_dynamic_themes(keywords: List[str], search_volumes: List[float], num_themes: int = 8) -> List[str]:
    """
    Original loose fallback extraction: Extracts high-volume, multi-word phrases.
    """
    phrase_scores = Counter()
    for kw, sv in zip(keywords, search_volumes):
        if not isinstance(kw, str) or not kw.strip(): continue
        
        words = re.findall(r'\b[a-z]{3,}\b', kw.lower())
        words = [w for w in words if w not in STOP_WORDS]
        
        clean_kw = " ".join(words)
        if clean_kw:
            phrase_scores[clean_kw] += sv
        
        for i in range(len(words)-1):
            bg = f"{words[i]} {words[i+1]}"
            phrase_scores[bg] += sv
            
        for i in range(len(words)-2):
            tg = f"{words[i]} {words[i+1]} {words[i+2]}"
            phrase_scores[tg] += sv

    weighted_scores = Counter()
    for phrase, vol in phrase_scores.items():
        word_count = len(phrase.split())
        if word_count >= 2:
            weighted_scores[phrase] = vol * (word_count ** 1.5)
            
    sorted_candidates = weighted_scores.most_common()
    themes = []
    
    for term, _ in sorted_candidates:
        if len(themes) >= num_themes: break
        overlap = False
        for t in themes:
            if term in t or t in term:
                overlap = True
                break
        if not overlap:
            themes.append(term)
            
    if len(themes) < num_themes:
        single_word_scores = Counter()
        for phrase, vol in phrase_scores.items():
            if len(phrase.split()) == 1:
                single_word_scores[phrase] = vol
        for term, _ in single_word_scores.most_common():
            if len(themes) >= num_themes: break
            overlap = False
            for t in themes:
                if term in t or t in term:
                    overlap = True
                    break
            if not overlap:
                themes.append(term)
                
    return [t.title() for t in themes]


def extract_hierarchical_themes(keywords: List[str], search_volumes: List[float], num_themes: int = 8) -> Tuple[List[str], List[str]]:
    """
    Extract themes by first identifying Root Nouns (e.g. 'table cloth') and then dominant modifiers.
    Returns: (list of hierarchical_themes, list of root_nouns)
    """
    phrase_scores = Counter()
    for kw, sv in zip(keywords, search_volumes):
        if not isinstance(kw, str) or not kw.strip(): continue
        words = re.findall(r'\b[a-z]{3,}\b', kw.lower())
        words = [w for w in words if w not in STOP_WORDS]
        
        # Consider bigrams as roots
        for i in range(len(words)-1):
            bg = f"{words[i]} {words[i+1]}"
            phrase_scores[bg] += sv

    if not phrase_scores:
        return [], []

    # Get top 2 root nouns
    root_nouns = [x[0] for x in phrase_scores.most_common(2)]
    
    modifier_scores = {r: Counter() for r in root_nouns}
    
    for kw, sv in zip(keywords, search_volumes):
        if not isinstance(kw, str) or not kw.strip(): continue
        kw_clean = kw.lower()
        for root in root_nouns:
            if root in kw_clean:
                words = re.findall(r'\b[a-z]{3,}\b', kw_clean)
                words = [w for w in words if w not in STOP_WORDS]
                root_words = root.split()
                # find words not in root
                modifiers = [w for w in words if w not in root_words]
                if modifiers:
                    # Score single modifiers
                    for m in modifiers:
                        modifier_scores[root][m] += sv
                break # Only process first matched root
                
    themes = []
    for root in root_nouns:
        # Add root modifiers
        top_modifiers = modifier_scores[root].most_common(num_themes // len(root_nouns))
        for mod, _ in top_modifiers:
            themes.append(f"{mod} {root}")

    # Fallback if too few
    if len(themes) < num_themes:
        # Add the roots themselves
        for root in root_nouns:
            if root not in themes and len(themes) < num_themes:
                themes.append(root)

    return [t.title() for t in themes], [r.title() for r in root_nouns]


def assign_themes(keywords: List[str], themes: List[str], root_nouns: List[str] = None) -> List[str]:
    """
    Assign keyword to hierarchical theme or root fallback.
    """
    assigned = []
    sorted_themes = sorted(themes, key=len, reverse=True)
    sorted_roots = sorted(root_nouns, key=len, reverse=True) if root_nouns else []
    
    for kw in keywords:
        if not isinstance(kw, str) or not kw.strip():
            assigned.append("Other")
            continue
            
        kw_lower = kw.lower()
        matched = False
        
        # First try full hierarchical themes
        for t in sorted_themes:
            # Match tokens to prevent "plastic table" matching "plastic table cloth"
            # Actually simple `in` is okay if we are careful, but let's just use `in` for now.
            if t.lower() in kw_lower:
                assigned.append(t)
                matched = True
                break
                
        # If no strict hierarchical theme matched, fallback to Root Noun
        if not matched and sorted_roots:
            for r in sorted_roots:
                if r.lower() in kw_lower:
                    assigned.append(r)
                    matched = True
                    break
                    
        if not matched:
            assigned.append("Other")
            
    return assigned
