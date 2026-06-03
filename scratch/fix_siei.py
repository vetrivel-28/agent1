import re

def fix_siei():
    with open("app/engines/siei_engine.py", "r", encoding="utf-8") as f:
        content = f.read()

    # 1. Update _keyword_row_evidence return dictionary to explicitly include what's needed
    # Actually, the user says "Evidence drawers still say... Every clickable card must show its actual formula, thresholds, source columns, rows included/excluded, and example calculation."
    # Let's replace the whole `summary_cards` block
    
    summary_cards_replacement = """            "summary_cards": {
                "high_revenue_potential": {
                    "count": high_intent_count,
                    "formula": "Demand Percentile >= 60 AND Revenue Efficiency Index >= 60",
                    "thresholds": {"demand_percentile_min": 60, "revenue_efficiency_percentile_min": 60},
                    "items": _records(demand_winners_df, max(top_n, 50)),
                    "evidence": _mk_evidence(
                        metric_name="High Revenue Potential Keywords",
                        metric_value=high_intent_count,
                        formula="Demand Percentile >= 60 AND Revenue Efficiency Index >= 60",
                        source_columns=["Keyword Phrase", "Search Volume", "Keyword Sales"],
                        rows_included=high_intent_count,
                        rows_excluded=n - high_intent_count,
                        thresholds={"demand_percentile_min": 60, "revenue_efficiency_percentile_min": 60},
                        example={
                            "rule": "Demand Percentile >= 60 AND Revenue Efficiency Index >= 60",
                            "top_keyword": _kw(best_converting),
                            "top_keyword_demand_percentile": _sv(best_converting.get("demand_percentile")) if best_converting is not None else None,
                            "top_keyword_efficiency_index": _sv(best_converting.get("revenue_efficiency_percentile")) if best_converting is not None else None,
                        },
                    ),
                },
                "friction_keywords": {
                    "count": friction_count,
                    "formula": "Demand Percentile >= 60 AND Revenue Efficiency Index < 40",
                    "thresholds": {"demand_percentile_min": 60, "revenue_efficiency_percentile_max_exclusive": 40},
                    "items": _records(friction_df, max(top_n, 50)),
                    "evidence": _mk_evidence(
                        metric_name="Friction Keywords",
                        metric_value=friction_count,
                        formula="Demand Percentile >= 60 AND Revenue Efficiency Index < 40",
                        source_columns=["Keyword Phrase", "Search Volume", "Keyword Sales"],
                        rows_included=friction_count,
                        rows_excluded=n - friction_count,
                        thresholds={"demand_percentile_min": 60, "revenue_efficiency_percentile_max_exclusive": 40},
                        example={
                            "rule": "Demand Percentile >= 60 AND Revenue Efficiency Index < 40",
                            "top_friction_keyword": _kw(biggest_friction),
                            "top_friction_demand_percentile": _sv(biggest_friction.get("demand_percentile")) if biggest_friction is not None else None,
                            "top_friction_efficiency_index": _sv(biggest_friction.get("revenue_efficiency_percentile")) if biggest_friction is not None else None,
                        },
                    ),
                },
                "recoverable_revenue": {
                    "value": total_lost_revenue,
                    "formula": "SUM(Recoverable Revenue) where Keyword is Friction Keyword",
                    "thresholds": {"benchmark_percentile": 75},
                    "evidence": _mk_evidence(
                        metric_name="Recoverable Revenue",
                        metric_value=total_lost_revenue,
                        formula="SUM(max(0, Benchmark Revenue/1K - Actual Revenue/1K) * Search Volume / 1000) for Friction Keywords",
                        source_columns=["Keyword Phrase", "Search Volume", "Keyword Sales"],
                        rows_included=friction_count,
                        rows_excluded=n - friction_count,
                        thresholds={"benchmark_percentile": 75},
                        example={
                            "top_friction_keyword": _kw(biggest_friction),
                            "recoverable_revenue_contribution": _sv(biggest_friction.get("recoverable_revenue")) if biggest_friction is not None else None,
                        },
                    ),
                },
                "top_revenue_efficiency_keyword": {
                    "keyword": _kw(best_converting),
                    "evidence": _mk_evidence(
                        metric_name="Top Revenue Efficiency Keyword",
                        metric_value=_kw(best_converting),
                        formula="Keyword with MAX(Revenue Efficiency Index)",
                        source_columns=["Keyword Phrase", "Search Volume", "Keyword Sales"],
                        rows_included=1,
                        rows_excluded=n - 1,
                        thresholds={"demand_percentile_min": 60, "revenue_efficiency_percentile_min": 60},
                        example={
                            "keyword": _kw(best_converting),
                            "efficiency_index": _sv(best_converting.get("revenue_efficiency_percentile")) if best_converting is not None else None,
                            "demand_percentile": _sv(best_converting.get("demand_percentile")) if best_converting is not None else None,
                        },
                    ),
                },
                "biggest_friction_keyword": {
                    "keyword": _kw(biggest_friction),
                    "evidence": _mk_evidence(
                        metric_name="Biggest Friction Keyword",
                        metric_value=_kw(biggest_friction),
                        formula="Keyword with MAX(Recoverable Revenue) among Friction Keywords",
                        source_columns=["Keyword Phrase", "Search Volume", "Keyword Sales"],
                        rows_included=1,
                        rows_excluded=n - 1,
                        thresholds={"demand_percentile_min": 60, "revenue_efficiency_percentile_max_exclusive": 40},
                        example={
                            "keyword": _kw(biggest_friction),
                            "recoverable_revenue": _sv(biggest_friction.get("recoverable_revenue")) if biggest_friction is not None else None,
                            "efficiency_gap": _sv(biggest_friction.get("efficiency_gap_per_1k")) if biggest_friction is not None else None,
                        },
                    ),
                },
            },"""
    
    # Do regex sub to replace the summary_cards block
    content = re.sub(r'            "summary_cards": \{.*?\n            \},', summary_cards_replacement, content, flags=re.DOTALL)
    
    with open("app/engines/siei_engine.py", "w", encoding="utf-8") as f:
        f.write(content)
        print("Updated summary_cards in siei_engine.py")

if __name__ == "__main__":
    fix_siei()
