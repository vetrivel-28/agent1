"""
LLM Service for generating Market Intelligence insights.
"""
import json
import os
import urllib.error
import urllib.request
from typing import Dict, Any


def check_llm_provider() -> tuple[bool, str]:
    """Detect configured LLM providers without hallucinating or crashing."""
    ollama_model = os.getenv("OLLAMA_MODEL", "").strip()
    ollama_host = os.getenv("OLLAMA_HOST", "http://127.0.0.1:11434").rstrip("/")

    def _ollama_models() -> list[str]:
        req = urllib.request.Request(f"{ollama_host}/api/tags", method="GET")
        with urllib.request.urlopen(req, timeout=2) as resp:
            payload = json.loads(resp.read().decode("utf-8"))
        return [m.get("name", "") for m in payload.get("models", []) if m.get("name")]

    if ollama_model:
        try:
            models = _ollama_models()
            if any(ollama_model in m or m.startswith(ollama_model) for m in models):
                return True, f"ollama:{ollama_model}"
            if models:
                return True, f"ollama:{models[0]}"
            return False, (
                f"LLM-assisted labeling unavailable — OLLAMA_MODEL={ollama_model} "
                "configured but no local models found in Ollama."
            )
        except (urllib.error.URLError, TimeoutError, json.JSONDecodeError, OSError):
            return False, (
                f"LLM-assisted labeling unavailable — OLLAMA_MODEL={ollama_model} "
                f"configured but Ollama is not reachable at {ollama_host}."
            )

    try:
        models = _ollama_models()
        llama_models = [m for m in models if "llama" in m.lower()]
        if llama_models:
            return True, f"ollama:{llama_models[0]}"
        if models:
            return True, f"ollama:{models[0]}"
    except (urllib.error.URLError, TimeoutError, json.JSONDecodeError, OSError):
        pass

    if os.getenv("OPENAI_API_KEY", "").strip():
        return True, "openai"
    if os.getenv("ANTHROPIC_API_KEY", "").strip():
        return True, "anthropic"

    return False, "LLM-assisted labeling unavailable — no configured local model found."


def format_percentage(val: float) -> str:
    """Format percentage based on whether it rounds to 0.0 or not."""
    if round(val, 1) == 0.0 and val > 0:
        return f"{val:.3f}%"
    return f"{val:.1f}%"

def call_llm(prompt: str) -> str:
    """Synchronous call to OpenAI LLM if configured, else returns empty string."""
    api_key = os.getenv("OPENAI_API_KEY", "").strip()
    if not api_key:
        return ""
    try:
        from openai import OpenAI
        client = OpenAI(api_key=api_key)
        response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[{"role": "user", "content": prompt}],
            temperature=0.3,
            max_tokens=200
        )
        return response.choices[0].message.content.strip()
    except Exception as e:
        return ""
import pandas as pd

def infer_core_category(df: pd.DataFrame, cat_col: str, title_col: str) -> str:
    """Heuristic to find the core product noun from a dataframe."""
    if cat_col and not df[cat_col].empty:
        mode = df[cat_col].mode()
        if not mode.empty:
            cat = str(mode.iloc[0]).split(">")[-1].strip()
            if cat.lower() not in ["home & kitchen", "kitchen", "home", "other"]:
                return cat
    # Fallback to most common word in titles
    titles = df[title_col].dropna().astype(str).str.lower()
    if titles.empty:
        return "Product"
    # Simple heuristic
    words = pd.Series(" ".join(titles).split()).value_counts()
    for word in words.index:
        if len(word) > 3 and word not in ["with", "for", "pack", "set", "black", "white", "size"]:
            return word.capitalize()
    return "Product"


def clean_product_title(raw_title: str) -> str:
    """Cleans keyword-stuffed Amazon product titles into readable display names."""
    if not raw_title or pd.isna(raw_title) or str(raw_title).lower() in ("nan", "none"):
        return "Unknown Product"
    title = str(raw_title)
    
    # Simple heuristic: take the first part before a comma, dash, or pipe
    for sep in [',', '|', ' - ', ' – ']:
        if sep in title:
            title = title.split(sep)[0]
    
    # Limit word count (Amazon titles have lots of keywords, the core item is usually first 4-6 words)
    words = title.split()
    if len(words) > 8:
        title = " ".join(words[:8])
        
    # Clean trailing characters or prepositions
    title = title.strip(" -|,:;")
    return title

def inferCategoryContext(datasets: Dict[str, Any]) -> Dict[str, Any]:
    df = datasets.get("blackbox", pd.DataFrame())
    cat_col = None
    title_col = None
    for c in df.columns:
        if "category" in c.lower() or "class" in c.lower():
            cat_col = c
        if "title" in c.lower() or "name" in c.lower():
            title_col = c
            
    main_category = "Product"
    if cat_col and not df[cat_col].empty:
        mode = df[cat_col].mode()
        if not mode.empty:
            cat = str(mode.iloc[0]).split(">")[-1].strip()
            if cat.lower() not in ["home & kitchen", "kitchen", "home", "other"]:
                main_category = cat

    core_product_nouns = []
    if title_col and not df[title_col].empty:
        titles = df[title_col].dropna().astype(str).str.lower()
        if not titles.empty:
            words = pd.Series(" ".join(titles).split()).value_counts()
            for word in words.index:
                if len(word) > 3 and word not in ["with", "for", "pack", "set", "black", "white", "size"]:
                    core_product_nouns.append(word.capitalize())
                    if len(core_product_nouns) >= 3:
                        break
                        
    if not core_product_nouns:
        core_product_nouns = [main_category]

    return {
        "main_category": main_category,
        "core_product_nouns": core_product_nouns,
        "synonyms": [],
        "variant_terms": ["pack", "set", "size", "color"],
        "use_cases": [],
        "occasion_terms": [],
        "audience_terms": [],
        "category_confidence": 0.8 if main_category != "Product" else 0.4,
        "evidence_used": ["title_frequency", "category_column_mode"]
    }

def classifyProductRelationship(candidate: str, categoryContext: Dict[str, Any], datasetSignals: Dict[str, Any] = None) -> str:
    candidate_lower = candidate.lower()
    main_noun = categoryContext.get("main_category", "").lower()
    core_nouns = [n.lower() for n in categoryContext.get("core_product_nouns", [])]
    
    if main_noun in candidate_lower or any(cn in candidate_lower for cn in core_nouns):
        if "kit" in candidate_lower or "bundle" in candidate_lower or "set" in candidate_lower or "+" in candidate_lower:
            return "PRODUCT_OPPORTUNITY"
        return "DIRECT_PRODUCT"
        
    if "alternative" in candidate_lower or "substitute" in candidate_lower or "different" in candidate_lower:
        return "SUBSTITUTE_PRODUCT"
    if "accessory" in candidate_lower or "attachment" in candidate_lower or "care" in candidate_lower:
        return "COMPLEMENT_PRODUCT"
        
    return "UNKNOWN"

def get_product_relations(core_noun: str, relation_type: str) -> list[str]:
    """
    Uses LLM to generate conceptual suggestions for substitutes, complements, or opportunities.
    Returns a list of suggested product strings.
    """
    if relation_type == "substitute":
        prompt = f"List 3 substitute products for '{core_noun}'. A substitute must share the same underlying customer need or use case but be a DIFFERENT product type (e.g. for Tablecloth, a substitute is Placemats or Table runner). Return ONLY a comma-separated list."
    elif relation_type == "complement":
        prompt = f"List 3 complement products for '{core_noun}'. A complement is an accessory or item frequently used TOGETHER with the main product (e.g. for Tablecloth, a complement is Napkins or Centerpiece decor). Return ONLY a comma-separated list."
    else:
        prompt = f"List 3 bundle or adjacent product opportunities for '{core_noun}'. An opportunity is a practical bundle or closely related adjacent product (e.g. for Tablecloth, an opportunity is Tablecloth + Napkin Set). Return ONLY a comma-separated list."
        
    res = call_llm(prompt)
    if not res:
        # Dynamic fallbacks based on core_noun
        if relation_type == "substitute": return [f"Alternative {core_noun} Type", f"Related Substitute for {core_noun}", f"Different Style of {core_noun}"]
        if relation_type == "complement": return [f"{core_noun} Accessory", f"Attachment for {core_noun}", f"{core_noun} Care Kit"]
        return [f"{core_noun} Starter Kit", f"{core_noun} + Accessory Bundle", f"Premium {core_noun} Set"]
    
    return [s.strip() for s in res.split(",") if s.strip()]


def generate_quadrant_insight(inputs: Dict[str, Any]) -> Dict[str, Any]:
    """
    Generates a data analyst insight using quadrant data based on 4 specific categories.
    Returns a structured dictionary formatted for the frontend intelligence card.
    """
    quadrant_name = inputs.get('quadrant_name', 'Unknown')
    brand_count = inputs.get('brand_count', 0)
    top_brands_data = inputs.get('top_brands_data', [])
    market_share_dist = float(str(inputs.get('market_share_distribution', '0')).replace('%', ''))
    category_revenue = inputs.get('category_revenue', 0.0)
    market_mean = inputs.get('market_mean', 0.0)
    total_brands = inputs.get('total_brands', 0)
    median_revenue = inputs.get('median_revenue', 0.0)
    quadrant_total_revenue = inputs.get('quadrant_total_revenue', 0.0)
    
    res = {
        "insights": []
    }

    if brand_count == 0 or not top_brands_data:
        res["insights"].append({
            "title": "KEY FINDING",
            "observation": "No brands currently meet the criteria for this quadrant.",
            "business_impact": f"This indicates a lack of brands showing {quadrant_name.lower()} characteristics within the current market structure.",
            "recommended_action": "Monitor market shifts for emerging brands that may eventually occupy this space.",
            "evidence": {
                "Brand Count": "0",
                "Quadrant": quadrant_name
            }
        })
        return res

    top_brand = top_brands_data[0]
    top_share = float(str(top_brand.get('revenue_share', 0)).replace('%', ''))
    top_brand_name = top_brand.get('brand', 'Unknown')
    mom_score = top_brand.get('momentum_score', 0)
    
    top_3_share = sum([float(str(b.get('revenue_share', 0)).replace('%', '')) for b in top_brands_data[:3]])
    avg_share_per_brand = market_share_dist / brand_count if brand_count > 0 else 0.0
    brand_pct_of_total = (brand_count / total_brands * 100) if total_brands > 0 else 0.0

    if quadrant_name == "Dominant Leaders":
        res["insights"].append({
            "title": "KEY FINDING",
            "observation": f"The top {brand_count} brands control {market_share_dist:.1f}% of category revenue, significantly outpacing the rest of the market.",
            "business_impact": f"With {market_share_dist:.1f}% of revenue concentrated in {brand_count} brands, organic displacement requires capturing share directly from these leaders.",
            "recommended_action": "Target lower-competition keyword clusters where leader share is weakest.",
            "evidence": {
                "Revenue Concentration": f"{market_share_dist:.1f}%"
            }
        })
        # 1. Revenue Concentration
        res["insights"].append({
            "title": "REVENUE CONCENTRATION",
            "observation": f"The leader tier holds {market_share_dist:.1f}% of all revenue across just {brand_count} brands.",
            "business_impact": f"This structural imbalance leaves only {100.0 - market_share_dist:.1f}% of total market revenue available for all non-leaders.",
            "recommended_action": "Model market entry costs based on the high concentration of revenue among incumbents.",
            "evidence": {
                "Total Category Revenue Share": f"{market_share_dist:.1f}%",
                "Remaining Market Share": f"{100.0 - market_share_dist:.1f}%",
                "Difference": f"+{market_share_dist - (100.0 - market_share_dist):.1f}%"
            }
        })
        # 2. Leader Performance
        next_brand_share = float(str(top_brands_data[1].get('revenue_share', 0)).replace('%', '')) if len(top_brands_data) > 1 else 0.0
        res["insights"].append({
            "title": "LEADER PERFORMANCE",
            "observation": f"{top_brand_name} holds {top_share:.1f}% of category revenue compared to the next largest brand at {next_brand_share:.1f}%.",
            "business_impact": f"The {top_share - next_brand_share:.1f}% share gap between the #1 and #2 brand indicates a high degree of revenue consolidation at the top.",
            "recommended_action": "Monitor the relative growth rate of the #2 brand to detect shifts in market share distribution.",
            "evidence": {
                "Largest Brand Share": f"{top_share:.1f}%",
                "Next Largest Brand": f"{next_brand_share:.1f}%",
                "Gap": f"+{top_share - next_brand_share:.1f}%"
            }
        })
        # 3. Momentum Comparison
        res["insights"].append({
            "title": "MOMENTUM COMPARISON",
            "observation": f"The top brand's momentum score is {mom_score:.1f} versus the category average of {market_mean:.1f}.",
            "business_impact": "A leader outpacing the market average by maintaining higher momentum is actively accelerating its sales volume relative to peers.",
            "recommended_action": "Focus competitive efforts on market segments where the leader's momentum score is mathematically lower.",
            "evidence": {
                "Leader Momentum vs Category Average": f"{mom_score:.1f}",
                "Category Average": f"{market_mean:.1f}",
                "Difference": f"+{mom_score - market_mean:.1f}" if mom_score >= market_mean else f"{mom_score - market_mean:.1f}"
            }
        })
        # 4. Growth Headroom
        avg_leader_share = top_3_share / min(3, brand_count) if brand_count > 0 else 0
        res["insights"].append({
            "title": "GROWTH HEADROOM",
            "observation": f"The top 3 brands capture {top_3_share:.1f}%, averaging {avg_leader_share:.1f}% each.",
            "business_impact": f"High top-3 concentration leaves limited remaining revenue ({100.0 - top_3_share:.1f}%) for the rest of the market.",
            "recommended_action": "Evaluate the financial viability of competing for the remaining available market share.",
            "evidence": {
                "Top 3 Share": f"{top_3_share:.1f}%",
                "Average Share per Leader": f"{avg_leader_share:.1f}%",
                "Comparison vs Average Brand": "Significantly higher"
            }
        })

    elif quadrant_name == "Growth Challengers":
        res["insights"].append({
            "title": "KEY FINDING",
            "observation": f"{brand_count} challengers are driving strong unit momentum but capturing only {market_share_dist:.1f}% of revenue.",
            "business_impact": "A high ratio of momentum to revenue share indicates under-monetization of current sales volume.",
            "recommended_action": "Review pricing elasticity and analyze average order values to improve revenue conversion.",
            "evidence": {
                "Sales vs Revenue": f"High Velocity / {market_share_dist:.1f}% Revenue Share"
            }
        })
        # 1. Growth Potential
        res["insights"].append({
            "title": "GROWTH POTENTIAL",
            "observation": f"Challengers like {top_brand_name} are achieving a momentum score of {mom_score:.1f} versus the market average of {market_mean:.1f}.",
            "business_impact": "Momentum exceeding the category average indicates accelerating sales velocity relative to the market baseline.",
            "recommended_action": "Focus on optimizing conversion rates to fully capture the demand generated by this high velocity.",
            "evidence": {
                "Sales Strength (Momentum)": f"{mom_score:.1f}",
                "Category Average": f"{market_mean:.1f}",
                "Difference": f"+{mom_score - market_mean:.1f}" if mom_score >= market_mean else f"{mom_score - market_mean:.1f}"
            }
        })
        # 2. Revenue Conversion Gap
        res["insights"].append({
            "title": "REVENUE CONVERSION GAP",
            "observation": f"Despite high velocity, these brands capture only {market_share_dist:.1f}% of revenue, a gap of {100.0 - market_share_dist:.1f}% from the rest of the market.",
            "business_impact": "Lower revenue share relative to high momentum points to a lower average unit revenue compared to market leaders.",
            "recommended_action": "Test phased pricing adjustments to determine if higher margins can be achieved without slowing momentum.",
            "evidence": {
                "Sales vs Revenue Imbalance": f"{market_share_dist:.1f}%",
                "Rest of Market": f"{100.0 - market_share_dist:.1f}%",
                "Difference": f"{- (100.0 - market_share_dist):.1f}%"
            }
        })
        # 3. Emerging Winners
        next_brand_mom = top_brands_data[1].get('momentum_score', 0) if len(top_brands_data) > 1 else market_mean
        res["insights"].append({
            "title": "EMERGING WINNERS",
            "observation": f"{top_brand_name} leads the challenger group with {mom_score:.1f} momentum, {mom_score - next_brand_mom:.1f} points ahead of the next challenger.",
            "business_impact": "Brands with higher relative momentum are capturing sales velocity faster than peers in the same quadrant.",
            "recommended_action": "Track changes in this momentum spread to anticipate potential shifts in revenue share rankings.",
            "evidence": {
                "Fastest Growing Brand Momentum": f"{mom_score:.1f}",
                "Next Challenger Momentum": f"{next_brand_mom:.1f}",
                "Difference": f"+{mom_score - next_brand_mom:.1f}"
            }
        })
        # 4. Scale Opportunity
        res["insights"].append({
            "title": "SCALE OPPORTUNITY",
            "observation": f"The group collectively holds {market_share_dist:.1f}% share, leaving {100.0 - market_share_dist:.1f}% in revenue upside.",
            "business_impact": "With existing volume established, mathematically increasing the average unit revenue directly scales total category share.",
            "recommended_action": "Calculate the projected revenue impact of increasing prices by a set percentage while holding volume constant.",
            "evidence": {
                "Current Revenue Share": f"{market_share_dist:.1f}%",
                "Maximum Upside": f"{100.0 - market_share_dist:.1f}%",
                "Revenue Upside Potential": f"{- (100.0 - market_share_dist):.1f}% gap"
            }
        })

    elif quadrant_name == "Revenue Heavyweights":
        res["insights"].append({
            "title": "KEY FINDING",
            "observation": f"{brand_count} heavyweights generate {market_share_dist:.1f}% of category revenue despite lagging in overall momentum ({mom_score:.1f} vs {market_mean:.1f} avg).",
            "business_impact": "These brands generate high revenue share but show lower relative unit momentum, indicating high revenue per sale.",
            "recommended_action": "Cross-reference momentum scores over consecutive periods to determine if unit volume is actively declining.",
            "evidence": {
                "Efficiency vs Velocity": f"{market_share_dist:.1f}% Share / {mom_score:.1f} Momentum"
            }
        })
        # 1. Revenue Efficiency
        res["insights"].append({
            "title": "REVENUE EFFICIENCY",
            "observation": f"These brands convert a smaller volume base into {market_share_dist:.1f}% of the total market revenue.",
            "business_impact": "Generating a disproportionately high revenue share from lower sales volume directly indicates high revenue efficiency per transaction.",
            "recommended_action": "Evaluate if maintaining high margins at lower volumes is more mathematically viable than lowering prices to chase volume.",
            "evidence": {
                "Revenue per Sale Proxy": f"{market_share_dist:.1f}%",
                "Rest of Market": f"{100.0 - market_share_dist:.1f}%",
                "Comparison": "Outperforming volume metrics"
            }
        })
        # 2. Pricing Analysis
        avg_heavyweight_share = market_share_dist / brand_count if brand_count > 0 else 0.0
        res["insights"].append({
            "title": "PRICING ANALYSIS",
            "observation": f"{top_brand_name} commands {top_share:.1f}% of category revenue, significantly higher than the heavyweight average of {avg_heavyweight_share:.1f}%.",
            "business_impact": "Higher revenue share relative to volume metrics indicates higher average unit revenue compared to the market.",
            "recommended_action": "Calculate the price elasticity coefficient to ensure current price points are not causing the momentum drag.",
            "evidence": {
                "Average Revenue Contribution (Leader)": f"{top_share:.1f}%",
                "Heavyweight Average Share": f"{avg_heavyweight_share:.1f}%",
                "Difference": f"+{top_share - avg_heavyweight_share:.1f}%"
            }
        })
        # 3. Sustainability Review
        res["insights"].append({
            "title": "SUSTAINABILITY REVIEW",
            "observation": f"The leading heavyweight holds a momentum score of {mom_score:.1f} compared to the {market_mean:.1f} category average.",
            "business_impact": "Trailing the category average momentum by mathematically significant margins indicates comparatively slower sales velocity.",
            "recommended_action": "Simulate the impact of a temporary price reduction on overall momentum and total revenue.",
            "evidence": {
                "Revenue Concentration Risk (Momentum)": f"{mom_score:.1f}",
                "Category Average": f"{market_mean:.1f}",
                "Difference": f"{mom_score - market_mean:.1f}"
            }
        })
        # 4. Competitive Pressure
        res["insights"].append({
            "title": "COMPETITIVE PRESSURE",
            "observation": f"With a momentum deficit of {(market_mean - mom_score):.1f} against the market mean, these brands risk exposure to faster-moving competitors.",
            "business_impact": "Slower relative momentum leaves these brands exposed to challengers currently capturing higher sales velocity.",
            "recommended_action": "Compare the heavyweight's momentum trajectory directly against the top 3 growing challengers.",
            "evidence": {
                "Heavyweight Momentum": f"{mom_score:.1f}",
                "Category Average": f"{market_mean:.1f}",
                "Exposure to Challenger Brands": f"{- (market_mean - mom_score):.1f}"
            }
        })

    elif quadrant_name == "Long Tail Players":
        res["insights"].append({
            "title": "KEY FINDING",
            "observation": f"{brand_count} long-tail brands ({brand_pct_of_total:.1f}% of all brands) contribute only {market_share_dist:.1f}% of category revenue.",
            "business_impact": f"The lower end of the market is highly fragmented, with each brand capturing an average of only {avg_share_per_brand:.3f}% share.",
            "recommended_action": "Use these metrics to rule out market entry via the long tail, as average returns are mathematically negligible.",
            "evidence": {
                "Brand Count vs Share": f"{brand_pct_of_total:.1f}% of brands / {market_share_dist:.1f}% of revenue"
            }
        })
        # 1. Revenue Fragmentation
        res["insights"].append({
            "title": "REVENUE FRAGMENTATION",
            "observation": f"The combined revenue share of the long tail is only {market_share_dist:.1f}% compared to {100.0 - market_share_dist:.1f}% for the rest of the market.",
            "business_impact": "High fragmentation means that the {market_share_dist:.1f}% revenue share is dispersed across {brand_count} discrete brands.",
            "recommended_action": "Analyze the distribution curve within the tail to see if any brands are approaching the challenger threshold.",
            "evidence": {
                "Combined Revenue Share": f"{market_share_dist:.1f}%",
                "Rest of Market Share": f"{100.0 - market_share_dist:.1f}%",
                "Difference": f"{market_share_dist - (100.0 - market_share_dist):.1f}%"
            }
        })
        # 2. Long Tail Contribution
        avg_revenue = (quadrant_total_revenue / brand_count) if brand_count > 0 else 0.0
        res["insights"].append({
            "title": "LONG TAIL CONTRIBUTION",
            "observation": f"The average revenue per long-tail brand is ${avg_revenue:,.2f}, compared to a median of ${median_revenue:,.2f}.",
            "business_impact": f"A median revenue of ${median_revenue:,.2f} indicates that 50% of these brands generate less than this specific amount.",
            "recommended_action": "Evaluate if the cost of maintaining market presence exceeds the median revenue generation.",
            "evidence": {
                "Average Revenue per Brand": f"${avg_revenue:,.2f}",
                "Median Revenue": f"${median_revenue:,.2f}",
                "Difference": f"${avg_revenue - median_revenue:,.2f}"
            }
        })
        # 3. Market Gap
        leader_share_proxy = 100.0 - market_share_dist
        res["insights"].append({
            "title": "REVENUE GAP",
            "observation": f"These brands capture {market_share_dist:.1f}% share, creating a {-leader_share_proxy:.1f}% gap versus the rest of the market.",
            "business_impact": f"Capturing only {market_share_dist:.1f}% combined share implies severely limited unit movement compared to the market leaders.",
            "recommended_action": "Calculate the required unit velocity to move a brand from the long tail into the next decile.",
            "evidence": {
                "Combined Revenue Share": f"{market_share_dist:.1f}%",
                "Leader Share Proxy": f"{leader_share_proxy:.1f}%",
                "Revenue Gap vs Leaders": f"{-leader_share_proxy:.1f}%"
            }
        })
        # 4. Niche Density
        res["insights"].append({
            "title": "MOMENTUM DEFICIT",
            "observation": f"The highest momentum in the long tail is {mom_score:.1f}, compared to a category average of {market_mean:.1f}.",
            "business_impact": "Momentum scores remaining below the category average indicate generally slow sales velocity across this entire tier.",
            "recommended_action": "Assess whether the market demand structure can mathematically support this many low-velocity brands.",
            "evidence": {
                "Momentum vs Category Average": f"{mom_score:.1f}",
                "Category Average": f"{market_mean:.1f}",
                "Difference": f"{mom_score - market_mean:.1f}"
            }
        })

    else:
        res["insights"].append({
            "title": "KEY FINDING",
            "observation": f"{brand_count} brands account for {market_share_dist:.1f}% of revenue.",
            "business_impact": "Market dynamics vary based on positioning.",
            "recommended_action": "Evaluate underlying metrics to determine strategic path.",
            "evidence": {
                "Brand Count": str(brand_count),
                "Revenue Share": f"{market_share_dist:.1f}%"
            }
        })

    return res
