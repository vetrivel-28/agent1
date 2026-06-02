"""
LLM Service for generating Market Intelligence insights.
"""
from typing import Dict, Any

def format_percentage(val: float) -> str:
    """Format percentage based on whether it rounds to 0.0 or not."""
    if round(val, 1) == 0.0 and val > 0:
        return f"{val:.3f}%"
    return f"{val:.1f}%"

def generate_quadrant_insight(inputs: Dict[str, Any]) -> Dict[str, Any]:
    """
    Generates a data analyst insight using quadrant data based on 7 specific categories.
    Returns a structured dictionary formatted for the frontend intelligence card.
    """
    quadrant_name = inputs.get('quadrant_name', 'Unknown')
    brand_count = inputs.get('brand_count', 0)
    top_brands_data = inputs.get('top_brands_data', [])
    top_5_share = inputs.get('revenue_concentration', 0.0)
    market_share_dist = float(str(inputs.get('market_share_distribution', '0')).replace('%', ''))
    
    res = {
        "insights": []
    }

    if brand_count == 0 or not top_brands_data:
        return res

    # 1. MARKET CONCENTRATION
    top_5_str = format_percentage(top_5_share)
    res["insights"].append({
        "title": "MARKET CONCENTRATION",
        "observation": f"Top 5 brands account for {top_5_str} of category revenue.",
        "why_it_matters": "A large share of revenue is concentrated among a small number of brands.",
        "potential_opportunity": "Investigate underserved segments outside the leading brands.",
        "evidence": {
            "Top 5 Revenue Share": top_5_str
        }
    })

    top_brand = top_brands_data[0]
    top_share = float(str(top_brand.get('revenue_share', 0)).replace('%', ''))
    top_share_str = format_percentage(top_share)

    # 2. LARGEST PLAYER ANALYSIS
    res["insights"].append({
        "title": "LARGEST PLAYER ANALYSIS",
        "observation": f"{top_brand['brand']} accounts for {top_share_str} of category revenue.",
        "why_it_matters": "This brand represents the largest revenue contributor in the dataset.",
        "potential_opportunity": "If growth indicators are weaker than revenue position, monitor for competitive openings.",
        "evidence": {
            "Brand": top_brand['brand'],
            "Revenue Share": top_share_str
        }
    })

    for b in top_brands_data:
        brand = b['brand']
        share = float(str(b.get('revenue_share', 0)).replace('%', ''))
        share_str = format_percentage(share)
        rev_pct = b['revenue_percentile']
        sales_pct = b['sales_percentile']
        mom_score = b['momentum_score']

        # 3. VULNERABLE LEADER DETECTION
        # High revenue share (> 5%) and low momentum (< 50) as approximation for category median
        if share > 5.0 and mom_score < 50.0:
            res["insights"].append({
                "title": "VULNERABLE LEADER DETECTION",
                "observation": f"{brand} holds {share_str} revenue share but momentum score is only {mom_score}.",
                "why_it_matters": "The brand's current revenue position exceeds its recent momentum performance.",
                "potential_opportunity": "Monitor whether faster-moving competitors gain share over time.",
                "evidence": {
                    "Brand": brand,
                    "Revenue Share": share_str,
                    "Momentum Score": str(mom_score)
                }
            })

        # 4. EMERGING CHALLENGERS
        # Momentum score > 80 as approximation for significantly above group average
        if mom_score > 80.0:
            res["insights"].append({
                "title": "EMERGING CHALLENGERS",
                "observation": f"{brand} shows stronger momentum than its current revenue position.",
                "why_it_matters": "The brand may be gaining traction faster than its market share suggests.",
                "potential_opportunity": "Track this brand as a potential future competitor.",
                "evidence": {
                    "Brand": brand,
                    "Momentum Score": str(mom_score),
                    "Revenue Percentile": str(rev_pct)
                }
            })

        # 5. PREMIUM POSITIONING SIGNAL
        if rev_pct > sales_pct + 20:
            res["insights"].append({
                "title": "PREMIUM POSITIONING SIGNAL",
                "observation": f"{brand} ranks higher in revenue than in sales volume.",
                "why_it_matters": "The brand generates relatively more revenue compared with units sold.",
                "potential_opportunity": "Investigate whether premium-priced products contribute to this difference.",
                "evidence": {
                    "Brand": brand,
                    "Revenue Percentile": str(rev_pct),
                    "Sales Percentile": str(sales_pct)
                }
            })

        # 6. VALUE/VOLUME SIGNAL
        if sales_pct > rev_pct + 20:
            res["insights"].append({
                "title": "VALUE/VOLUME SIGNAL",
                "observation": f"{brand} ranks higher in sales volume than revenue.",
                "why_it_matters": "The brand sells relatively more units compared with its revenue position.",
                "potential_opportunity": "Investigate pricing or product mix differences.",
                "evidence": {
                    "Brand": brand,
                    "Sales Percentile": str(sales_pct),
                    "Revenue Percentile": str(rev_pct)
                }
            })

    # 7. LONG-TAIL FRAGMENTATION
    if market_share_dist < 5.0:
        res["insights"].append({
            "title": "LONG-TAIL FRAGMENTATION",
            "observation": f"{brand_count} brands collectively account for {format_percentage(market_share_dist)} of revenue.",
            "why_it_matters": "No individual brand contributes a meaningful share of category revenue.",
            "potential_opportunity": "Monitor whether any brand begins separating from the group over time.",
            "evidence": {
                "Brand Count": str(brand_count),
                "Group Revenue Share": format_percentage(market_share_dist)
            }
        })

    return res
