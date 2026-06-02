import re
from typing import List

CATEGORY_RULES = {
    "Bags": ["bag", "bags"],
    "Totes": ["tote", "totes"],
    "Purses": ["purse", "purses"],
    "Gifts": ["gift", "gifts"],
    "Backpacks": ["backpack", "backpacks"],
    "Handbags": ["handbag", "handbags"],
    "Crossbody": ["crossbody"]
}

def get_matching_categories(keyword: str) -> List[str]:
    """
    Returns all categories that a keyword belongs to based on overlapping substring logic.
    To avoid 'cabbage' matching 'bag', we use word boundaries.
    """
    kw = str(keyword).lower()
    matches = []
    
    for category, terms in CATEGORY_RULES.items():
        for term in terms:
            # Word boundary regex to safely match the exact term
            pattern = r'\b' + re.escape(term) + r'\b'
            if re.search(pattern, kw):
                matches.append(category)
                break # Only need to match one term per category
                
    if not matches:
        matches.append("Other")
        
    return matches

def get_category_formula(category: str) -> str:
    """Returns the evidence formula for a given category."""
    if category == "Other":
        return "Does not match any defined category rules."
    terms = CATEGORY_RULES.get(category, [])
    if not terms:
        return ""
    conditions = [f'"{t}"' for t in terms]
    return f"Contains {' OR '.join(conditions)}"
