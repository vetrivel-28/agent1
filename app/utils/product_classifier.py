"""
Product Classifier Utility
==========================
Simulates semantic functional extraction from product titles to prevent false string-matching relationships.
Extracts: product_type, customer_use_case, product_function.
"""

from typing import Dict, Any

def classify_product(title: str) -> Dict[str, str]:
    """
    Parses a product title and extracts normalized functional categories.
    """
    title_lower = title.lower()
    
    # Billiards / Pool
    if 'pool table felt' in title_lower or 'billiard' in title_lower:
        return {
            "product_type": "pool_table_felt",
            "use_case": "billiards_surface",
            "function": "pool_table_surface_material"
        }
    
    # Religious / Altar
    if 'altar' in title_lower:
        return {
            "product_type": "altar_cloth",
            "use_case": "religious_ceremony",
            "function": "sacred_surface_cover"
        }

    # Dining Table Accessories
    if 'runner' in title_lower:
        return {
            "product_type": "table_runner",
            "use_case": "dining_table_decoration",
            "function": "decorative_table_accent"
        }
    
    if 'placemat' in title_lower or 'place mat' in title_lower:
        return {
            "product_type": "placemat",
            "use_case": "dining_table_protection",
            "function": "individual_place_setting"
        }

    if 'napkin' in title_lower:
        return {
            "product_type": "napkin_set",
            "use_case": "dining_table_accessory",
            "function": "personal_dining_cloth"
        }

    if 'chair cover' in title_lower:
        return {
            "product_type": "chair_cover",
            "use_case": "dining_room_furniture_protection",
            "function": "furniture_cover"
        }

    if 'vinyl' in title_lower and 'protector' in title_lower:
        return {
            "product_type": "vinyl_table_protector",
            "use_case": "dining_table_protection",
            "function": "heavy_duty_surface_protection"
        }
        
    if 'decorative' in title_lower and 'cover' in title_lower:
        return {
            "product_type": "decorative_dining_cover",
            "use_case": "dining_table_decoration",
            "function": "aesthetic_surface_cover"
        }

    # Default Dining Table Cloth fallback for generic cloth/cover items
    if 'cloth' in title_lower or 'cover' in title_lower or 'tablecloth' in title_lower:
        return {
            "product_type": "table_cloth",
            "use_case": "dining_table_decoration",
            "function": "cover_and_protect_table"
        }

    # Fallback
    return {
        "product_type": "unknown_product",
        "use_case": "general_household",
        "function": "general_purpose"
    }

def is_radically_different(prod1: Dict[str, str], prod2: Dict[str, str]) -> bool:
    """
    Returns True if the two products operate in completely different fundamental domains.
    e.g. Billiards vs Dining.
    """
    # Define incompatible use case domains
    billiards = ["billiards_surface"]
    dining = ["dining_table_decoration", "dining_table_protection", "dining_table_accessory", "dining_room_furniture_protection"]
    religious = ["religious_ceremony"]
    
    uc1 = prod1.get("use_case", "")
    uc2 = prod2.get("use_case", "")
    
    if uc1 in billiards and uc2 in dining: return True
    if uc2 in billiards and uc1 in dining: return True
    
    if uc1 in religious and uc2 in dining: return True
    if uc2 in religious and uc1 in dining: return True
    
    if uc1 in religious and uc2 in billiards: return True
    if uc2 in religious and uc1 in billiards: return True
    
    return False

import re

def generate_family_key(title: str) -> str:
    """
    Normalizes a product title by removing stop words and dimensions to generate a core family key.
    Examples:
      "Mud Cloth Table Runner 14x72" -> "mud cloth table runner"
      "Mud Cloth Table Runner Black" -> "mud cloth table runner"
    """
    if not title: return ""
    
    t = title.lower()
    
    # Remove dimensions like 14x72, 120 inch, etc.
    t = re.sub(r'\b\d+x\d+\b', '', t)
    t = re.sub(r'\b\d+\s*(inch|in|cm|mm|ft)\b', '', t)
    
    # Common stop words for products
    stop_words = {
        "black", "white", "red", "blue", "green", "yellow", "brown", "grey", "gray",
        "small", "medium", "large", "set", "pack", "with", "for", "and", "the", "in",
        "of", "a", "an", "on", "to", "at", "by", "from", "up", "down", "out", "new",
        "piece", "pcs"
    }
    
    words = t.split()
    filtered_words = [w for w in words if w not in stop_words and w.isalnum()]
    
    return " ".join(filtered_words).strip()

