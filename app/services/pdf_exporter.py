"""Deterministic PDF exporter for market report."""
from __future__ import annotations

import os
import tempfile
import datetime
from typing import Any, Dict, List, Optional

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4, letter
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle, PageBreak
from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_RIGHT

def _header_footer(canvas, doc):
    canvas.saveState()
    canvas.setFont('Helvetica', 9)
    canvas.setStrokeColor(colors.lightgrey)
    canvas.line(doc.leftMargin, doc.bottomMargin - 15, doc.width + doc.leftMargin, doc.bottomMargin - 15)
    canvas.drawString(doc.leftMargin, doc.bottomMargin - 30, "Confidential - Market Intelligence Report")
    canvas.drawRightString(doc.width + doc.leftMargin, doc.bottomMargin - 30, f"Page {doc.page}")
    canvas.restoreState()

def _format_value(value: Any) -> str:
    if value is None:
        return "N/A"
    if isinstance(value, bool):
        return str(value)
    if isinstance(value, int):
        return f"{value:,}"
    if isinstance(value, float):
        return f"{value:,.2f}"
    return str(value)


def _build_bar_string(value: float, max_value: float, width: int = 18) -> str:
    if not isinstance(value, (int, float)) or max_value <= 0:
        return ""
    fill = int(round(min(1.0, max(0.0, float(value) / float(max_value))) * width))
    return "█" * fill + "░" * (width - fill)

REPORT_MODE_EXECUTIVE = "executive"
REPORT_MODE_DETAILED = "detailed"
MAX_TABLE_ROWS_EXECUTIVE = 5
MAX_TABLE_ROWS_DETAILED = 25


def _safe_cell_value(value: Any, max_length: int = 55) -> str:
    if value is None:
        return "N/A"
    if isinstance(value, bool):
        return str(value)
    if isinstance(value, (int, float)):
        return _format_value(value)
    if isinstance(value, str):
        text = value.replace("\n", " ").strip()
        return text if len(text) <= max_length else text[: max_length - 3] + "..."
    if isinstance(value, dict):
        keys = list(value.keys())[:3]
        items = [f"{k}:{_safe_cell_value(value[k], max_length=15)}" for k in keys]
        return ", ".join(items) if items else "Object"
    if isinstance(value, list):
        if not value:
            return "None"
        if all(isinstance(item, dict) for item in value):
            return f"{len(value)} items"
        return ", ".join(_safe_cell_value(item, max_length=15) for item in value[:3])
    return str(value)[:max_length]


def _limit_table_rows(records: List[Dict[str, Any]], max_rows: int = MAX_TABLE_ROWS_EXECUTIVE) -> tuple[List[Dict[str, Any]], int]:
    return records[:max_rows], len(records)


def _section_unavailable(title: str, reason: str, styles: Any) -> List[Any]:
    elems: List[Any] = []
    elems.append(Paragraph(f"<b>{title}</b>", styles["Heading4"]))
    unavailable_style = ParagraphStyle(
        'MissingData',
        parent=styles['BodyText'],
        backColor=colors.HexColor("#fee2e2"),
        textColor=colors.HexColor("#b91c1c"),
        borderColor=colors.HexColor("#fecaca"),
        borderWidth=1,
        borderPadding=8,
        leading=14,
        spaceAfter=12,
    )
    elems.append(Paragraph(reason, unavailable_style))
    elems.append(Spacer(1, 12))
    return elems


def _table_from_records(
    records: List[Dict[str, Any]],
    title: str,
    max_rows: int = MAX_TABLE_ROWS_EXECUTIVE,
    max_columns: int = 6,
    total_rows: Optional[int] = None,
) -> List[Any]:
    elems: List[Any] = []
    styles = getSampleStyleSheet()
    title_style = ParagraphStyle(
        'TableTitle',
        parent=styles['Heading3'],
        fontSize=12,
        textColor=colors.HexColor("#1e293b"),
        spaceAfter=6,
    )
    elems.append(Paragraph(f"<b>{title}</b>", title_style))

    if not records:
        elems.append(Paragraph("No rows were returned for this section.", styles["BodyText"]))
        elems.append(Spacer(1, 12))
        return elems

    total = total_rows if total_rows is not None else len(records)
    display_rows = min(max_rows, len(records))
    if total > display_rows:
        elems.append(Paragraph(
            f"Top {display_rows} of {total} shown.",
            ParagraphStyle('TableFootnote', parent=styles['BodyText'], fontSize=9, textColor=colors.HexColor("#475569")),
        ))
        elems.append(Spacer(1, 4))

    cols = list(records[0].keys())[:max_columns]
    data = [cols]

    for row in records[:display_rows]:
        row_data = [_safe_cell_value(row.get(c, "")) for c in cols]
        data.append(row_data)

    table = Table(data, repeatRows=1, hAlign='LEFT')
    table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#4338ca")),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("ALIGN", (0, 0), (-1, 0), "CENTER"),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, 0), 9),
        ("BOTTOMPADDING", (0, 0), (-1, 0), 8),
        ("TOPPADDING", (0, 0), (-1, 0), 8),
        ("BACKGROUND", (0, 1), (-1, -1), colors.white),
        ("TEXTCOLOR", (0, 1), (-1, -1), colors.HexColor("#334155")),
        ("ALIGN", (0, 1), (-1, -1), "LEFT"),
        ("FONTNAME", (0, 1), (-1, -1), "Helvetica"),
        ("FONTSIZE", (0, 1), (-1, -1), 8),
        ("BOTTOMPADDING", (0, 1), (-1, -1), 6),
        ("TOPPADDING", (0, 1), (-1, -1), 6),
        ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#e2e8f0")),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
    ]))
    elems.append(table)
    elems.append(Spacer(1, 16))
    return elems


def _table_from_kpi_pairs(pairs: List[tuple[str, Any, str]], title: str) -> List[Any]:
    records = [{"KPI": name, "Value": _safe_cell_value(value), "Notes": note} for name, value, note in pairs]
    return _table_from_records(records, title, max_rows=len(records), max_columns=3)


def _bar_chart_table(records: List[Dict[str, Any]], label_key: str, value_key: str, title: str, max_rows: int = MAX_TABLE_ROWS_EXECUTIVE) -> List[Any]:
    if not records or not any(label_key in r for r in records) or not any(value_key in r for r in records):
        styles = getSampleStyleSheet()
        return [Paragraph(f"<b>{title}</b>", styles["Heading4"]), Paragraph("No chart data available.", styles["BodyText"]), Spacer(1, 12)]
    values = [float(r.get(value_key) or 0) for r in records if r.get(value_key) is not None]
    max_value = max(values) if values else 0.0
    chart_records = []
    for row in records[:max_rows]:
        chart_records.append({
            label_key: str(row.get(label_key, ""))[:45],
            "Value": _safe_cell_value(row.get(value_key)),
            "Trend": _build_bar_string(float(row.get(value_key) or 0), max_value),
        })
    return _table_from_records(chart_records, title, max_rows=max_rows, max_columns=3)


def _insight_box(lines: List[str], background: colors.HexColor = colors.HexColor("#eff6ff")) -> List[Any]:
    styles = getSampleStyleSheet()
    box_style = ParagraphStyle(
        'InsightBox',
        parent=styles['BodyText'],
        backColor=background,
        borderColor=colors.HexColor("#93c5fd"),
        borderWidth=1,
        borderPadding=8,
        leftIndent=0,
        rightIndent=0,
        leading=14,
    )
    text = "<br/>".join(lines)
    table = Table([[Paragraph(text, box_style)]], colWidths=[450])
    table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), background),
        ("BOX", (0, 0), (-1, -1), 0.5, colors.HexColor("#93c5fd")),
        ("LEFTPADDING", (0, 0), (-1, -1), 10),
        ("RIGHTPADDING", (0, 0), (-1, -1), 10),
        ("TOPPADDING", (0, 0), (-1, -1), 10),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 10),
    ]))
    return [table, Spacer(1, 12)]


def _missing_section_reason(section_name: str, source_data: Dict[str, Any]) -> str:
    if not source_data:
        return f"{section_name} unavailable because no engine results were generated."
    missing = source_data.get("validation", {}).get("missing_columns") or source_data.get("missing_columns")
    if missing:
        return f"{section_name} unavailable because required columns are missing: {missing}. Found: {source_data.get('columns_used', [])}."
    return f"{section_name} unavailable because the data source is empty or did not return a structured result."


def _text_block(lines: List[str], styles: Any) -> List[Any]:
    elems: List[Any] = []
    for line in lines:
        elems.append(Paragraph(line, styles["BodyText"]))
        elems.append(Spacer(1, 6))
    elems.append(Spacer(1, 12))
    return elems


def _score_card(title: str, value: Any, description: str = "") -> List[Any]:
    styles = getSampleStyleSheet()
    elems = []
    
    # Custom style for KPI Card
    elems.append(Paragraph(f"<b>{title}</b>", ParagraphStyle('KPITitle', parent=styles['Normal'], fontSize=11, textColor=colors.HexColor("#64748b"))))
    elems.append(Paragraph(f"{value}", ParagraphStyle('KPIValue', parent=styles['Normal'], fontSize=18, fontName='Helvetica-Bold', textColor=colors.HexColor("#0f172a"), spaceBefore=4, spaceAfter=2)))
    if description:
        elems.append(Paragraph(description, ParagraphStyle('KPIDesc', parent=styles['Normal'], fontSize=8, textColor=colors.HexColor("#94a3b8"))))
    elems.append(Spacer(1, 10))
    return elems

def _section_header(title: str, number: str = "") -> List[Any]:
    styles = getSampleStyleSheet()
    elems = []
    elems.append(Spacer(1, 15))
    header_text = f"{number}. {title}" if number else title
    
    style = ParagraphStyle(
        'SectionHeader',
        parent=styles['Heading2'],
        fontSize=16,
        textColor=colors.HexColor("#1e40af"),
        spaceBefore=15,
        spaceAfter=15,
        borderPadding=(0, 0, 4, 0),
        borderColor=colors.HexColor("#cbd5e1"),
        borderWidth=1
    )
    
    elems.append(Paragraph(f"<b>{header_text}</b>", style))
    return elems

def export_market_report_pdf(
    report: Dict[str, Any],
    report_mode: str = REPORT_MODE_EXECUTIVE,
    max_rows: Optional[int] = None,
    include_charts: bool = True,
    include_appendix: Optional[bool] = None,
) -> str:
    fd, output_path = tempfile.mkstemp(prefix="market_report_", suffix=".pdf")
    os.close(fd)

    if max_rows is None:
        max_rows = 5  # Enforced globally per requirements
    if include_appendix is None:
        include_appendix = report_mode == REPORT_MODE_DETAILED

    doc = SimpleDocTemplate(
        output_path,
        pagesize=letter,
        leftMargin=50,
        rightMargin=50,
        topMargin=50,
        bottomMargin=50,
    )

    styles = getSampleStyleSheet()
    elems: List[Any] = []
    results = report.get("results", {})

    executive = results.get("executive_summary", {})
    market_health = results.get("market_health", {})
    demand = results.get("demand_analysis", {})
    demand_velocity = results.get("demand_velocity", {})
    siei = results.get("siei", {}) or results.get("keyword_conversion_intelligence", {})
    whitespace = results.get("whitespace", {}) or results.get("revenue_opportunity_by_segment", {})
    brand = results.get("brand_momentum", {}) or results.get("sales_momentum_intelligence", {})
    revenue = results.get("revenue_analysis", {}) or results.get("revenue_momentum_intelligence", {})
    bsr = results.get("bsr_efficiency_analysis", {})
    hhi = results.get("hhi", {}) or results.get("market_structure", {})
    direct_competitors = results.get("direct_competitors", {}) or results.get("product_intelligence", {}).get("direct_competitors", {})
    substitute = results.get("substitute_intelligence", {}) or results.get("product_intelligence", {}).get("substitute_intelligence", {})
    complement = results.get("complement_intelligence", {}) or results.get("product_intelligence", {}).get("complement_intelligence", {})
    bundle = results.get("bundle_opportunities", {}) or results.get("product_intelligence", {}).get("bundle_opportunities", {})
    price_elasticity = results.get("price_elasticity", {})
    finance = results.get("finance_intelligence", {})
    risks = results.get("risk_signals", {}).get("signals", [])
    opportunities = results.get("opportunity_signals", {}).get("signals", [])
    final_verdict = results.get("final_market_verdict", {})
    dataset_diag = results.get("dataset_diagnostics", {})
    theme_quality = results.get("classification_diagnostics", {}).get("theme_quality") or results.get("theme_quality") or demand.get("theme_quality", {})
    metadata = results.get("report_metadata", {})

    elems.append(Spacer(1, 80))
    elems.append(Paragraph("<b>Market Intelligence Report</b>", ParagraphStyle('MainTitle', parent=styles['Title'], fontSize=30, textColor=colors.HexColor("#0f172a"), spaceAfter=18, alignment=TA_CENTER)))
    elems.append(Paragraph("Data-driven executive brief for strategic market decisions.", ParagraphStyle('SubTitle', parent=styles['Normal'], fontSize=13, textColor=colors.HexColor("#475569"), alignment=TA_CENTER)))
    elems.append(Spacer(1, 24))

    cover_rows = [
        ["Generated Date", datetime.datetime.now().strftime("%B %d, %Y %H:%M")],
        ["Datasets Loaded", ", ".join(dataset_diag.get("datasets_loaded", [])) or "None"],
        ["Keyword Rows", _format_value(metadata.get("keyword_rows"))],
        ["Product Rows", _format_value(metadata.get("product_rows"))],
        ["Brands", _format_value(metadata.get("brand_count"))],
        ["Final Market Score", _format_value(metadata.get("final_market_score"))],
        ["Market Direction", str(metadata.get("market_direction", "N/A")).title()],
    ]
    cover_table = Table(cover_rows, colWidths=[170, 260])
    cover_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, -1), colors.HexColor('#f8fafc')),
        ('TEXTCOLOR', (0, 0), (-1, -1), colors.HexColor('#0f172a')),
        ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#cbd5e1')),
        ('FONTNAME', (0, 0), (-1, -1), 'Helvetica'),
        ('FONTSIZE', (0, 0), (-1, -1), 10),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('LEFTPADDING', (0, 0), (-1, -1), 8),
        ('RIGHTPADDING', (0, 0), (-1, -1), 8),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 8),
    ]))
    elems.append(cover_table)
    elems.append(PageBreak())

    elems.extend(_section_header("Executive Summary", "2"))
    exec_kpis = [
        ("Final Market Score", metadata.get("final_market_score", "N/A"), "Composite intelligence score."),
        ("Market Direction", metadata.get("market_direction", "N/A"), "Derived from demand and momentum signals."),
        ("Demand Strength", demand.get("demand_score", "N/A"), "Search demand and interest levels."),
        ("Finance Health", finance.get("finance_health_score", "N/A"), "Economic attractiveness for launch."),
    ]
    elems.extend(_table_from_kpi_pairs(exec_kpis, "Executive KPI Summary"))
    insight_lines: List[str] = []
    if executive.get("market_economics"):
        insight_lines.append(executive.get("market_economics"))
    insight_lines.extend(opportunities[:2])
    insight_lines.extend(risks[:2])
    if not insight_lines:
        insight_lines = ["Insight data is not available for this dataset."]
    elems.extend(_insight_box(insight_lines, colors.HexColor("#eef2ff")))
    elems.append(PageBreak())

    elems.extend(_section_header("Dataset Diagnostics", "3"))
    if dataset_diag:
        diag_rows = [
            ["Dataset", "Available", "Rows", "Columns", "Missing Expected", "Duplicates", "Blank Rows"],
            [
                dataset_diag.get("blackbox", {}).get("dataset_name", "Blackbox"),
                str(dataset_diag.get("blackbox", {}).get("available", False)),
                _format_value(dataset_diag.get("blackbox", {}).get("row_count")),
                _format_value(dataset_diag.get("blackbox", {}).get("column_count")),
                ", ".join(dataset_diag.get("blackbox", {}).get("missing_expected_columns", [])) or "None",
                _format_value(dataset_diag.get("blackbox", {}).get("duplicate_rows_removed")),
                _format_value(dataset_diag.get("blackbox", {}).get("blank_rows_removed")),
            ],
            [
                dataset_diag.get("magnet", {}).get("dataset_name", "Magnet"),
                str(dataset_diag.get("magnet", {}).get("available", False)),
                _format_value(dataset_diag.get("magnet", {}).get("row_count")),
                _format_value(dataset_diag.get("magnet", {}).get("column_count")),
                ", ".join(dataset_diag.get("magnet", {}).get("missing_expected_columns", [])) or "None",
                _format_value(dataset_diag.get("magnet", {}).get("duplicate_rows_removed")),
                _format_value(dataset_diag.get("magnet", {}).get("blank_rows_removed")),
            ],
        ]
        elems.append(Table(diag_rows, colWidths=[100, 55, 50, 55, 150, 55, 55], style=TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#0f172a')),
            ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
            ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#cbd5e1')),
            ('FONTSIZE', (0, 0), (-1, -1), 9),
            ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ])))
    else:
        elems.extend(_section_unavailable("Dataset Diagnostics", "Dataset diagnostics unavailable because the report data did not include the expected diagnostics section.", styles))
    elems.append(PageBreak())

    elems.extend(_section_header("Demand Intelligence", "4"))
    if demand.get("top_demand_keywords"):
        elems.extend(_text_block([
            f"Demand Score: {_format_value(demand.get('demand_score'))}",
            f"Demand Trend: {demand.get('demand_trend', 'N/A')}",
        ], styles))
        if include_charts:
            elems.extend(_bar_chart_table(demand.get("top_demand_keywords", []), "keyword", "search_volume", "Top Demand Keywords", max_rows=max_rows))
        elems.extend(_table_from_records(demand.get("top_demand_keywords", []), "Top Demand Keywords", max_rows=max_rows, total_rows=len(demand.get("top_demand_keywords", []))))
        elems.extend(_insight_box([
            "Demand is concentrated in the top-performing search terms.",
            "Prioritize the highest-volume keywords for launch and creative testing.",
        ], colors.HexColor("#dcfce7")))
    else:
        elems.extend(_section_unavailable("Demand Intelligence", _missing_section_reason("Demand Intelligence", demand), styles))
    elems.append(PageBreak())

    if theme_quality and theme_quality.get("detected_demand_themes", 0) > 0:
        elems.extend(_section_header("Demand Theme Readiness", "4b"))
        elems.extend(_table_from_kpi_pairs([
            ("Detected Themes", theme_quality.get("detected_demand_themes", "N/A"), "Total detected demand clusters."),
            ("Specific Intent", theme_quality.get("specific_buyer_intent_themes", "N/A"), "Highly specific buyer themes."),
            ("Used for Scoring", theme_quality.get("themes_used_for_scoring", "N/A"), "Themes eligible for KPI use."),
            ("Excluded", theme_quality.get("themes_excluded_from_scoring", "N/A"), "Themes excluded due to low confidence."),
            ("Generic Share", f"{theme_quality.get('generic_demand_share_pct', 0)}%", "Percentage of generic broad demand."),
        ], "Theme Readiness Metrics"))
        
        insights = theme_quality.get("insights", [])
        if insights:
            elems.extend(_insight_box(insights[:3], colors.HexColor("#f8fafc")))
        
        rec_action = theme_quality.get("recommended_action")
        if rec_action:
            elems.extend(_text_block([f"<b>Recommended Action:</b> {rec_action}"], styles))
        elems.append(PageBreak())

    elems.extend(_section_header("Conversion Intelligence", "5"))
    if siei:
        elems.extend(_table_from_kpi_pairs([
            ("High Intent", siei.get("high_intent_count"), "High-conversion keyword volume."),
            ("Friction", siei.get("friction_count"), "Demand with conversion drag."),
            ("Hidden Gems", siei.get("hidden_gems_count", len(siei.get("hidden_gems", []))), "Untapped keywords."),
            ("Low Priority", siei.get("low_priority_count", len(siei.get("low_priority_keywords", []))), "Keywords to deprioritize."),
        ], "Conversion KPI Summary"))
        if include_charts and siei.get("top_conversion_opportunities"):
            elems.extend(_bar_chart_table(siei.get("top_conversion_opportunities", []), "keyword", "conversion_score", "Top Conversion Opportunities", max_rows=max_rows))
        elems.extend(_table_from_records(siei.get("demand_winners", []), "Demand Winners", max_rows=max_rows, total_rows=len(siei.get("demand_winners", []))))
        elems.extend(_table_from_records(siei.get("friction_keywords", []), "Conversion Leaks", max_rows=max_rows, total_rows=len(siei.get("friction_keywords", []))))
        if siei.get("hidden_gems"):
            elems.extend(_table_from_records(siei.get("hidden_gems", []), "Hidden Gems", max_rows=max_rows, total_rows=len(siei.get("hidden_gems", []))))
    else:
        elems.extend(_section_unavailable("Conversion Intelligence", _missing_section_reason("Conversion Intelligence", siei), styles))
    elems.append(PageBreak())

    elems.extend(_section_header("Revenue Opportunity & Sales Momentum", "6"))
    if whitespace or brand:
        if whitespace:
            elems.extend(_text_block([
                f"Opportunity score: {_format_value(whitespace.get('overall_whitespace_score'))}",
                f"Estimated revenue pool: ${_format_value(whitespace.get('revenue_opportunity_pool'))}",
            ], styles))
            if include_charts:
                elems.extend(_bar_chart_table(whitespace.get("top_entry_segments", []), "segment", "opportunity_revenue", "Top Opportunity Segments", max_rows=max_rows))
            elems.extend(_table_from_records(whitespace.get("top_entry_segments", []), "Opportunity Segments", max_rows=max_rows, total_rows=len(whitespace.get("top_entry_segments", []))))
        if brand:
            elems.extend(_text_block([
                f"Fastest growing brands: {len(brand.get('fastest_growing_brands', []))}",
                f"Declining brands: {len(brand.get('declining_brands', []))}",
            ], styles))
            elems.extend(_table_from_records(brand.get("fastest_growing_brands", []), "Top Growth Brands", max_rows=max_rows, total_rows=len(brand.get("fastest_growing_brands", []))))
            elems.extend(_table_from_records(brand.get("declining_brands", []), "Declining Brands", max_rows=max_rows, total_rows=len(brand.get("declining_brands", []))))
    else:
        elems.extend(_section_unavailable("Revenue Opportunity & Sales Momentum", "Revenue opportunity and sales momentum data unavailable.", styles))
    elems.append(PageBreak())

    elems.extend(_section_header("Market Structure & Product Intelligence", "7"))
    if revenue or hhi or direct_competitors or substitute or complement or bundle:
        if revenue:
            elems.extend(_text_block([
                f"Revenue momentum score: {_format_value(revenue.get('revenue_momentum_score'))}",
                f"Total market revenue: ${_format_value(revenue.get('total_market_revenue'))}",
            ], styles))
            if include_charts:
                elems.extend(_bar_chart_table(revenue.get("top_revenue_brands", []), "brand", "revenue_share", "Top Revenue Brands", max_rows=max_rows))
            elems.extend(_table_from_records(revenue.get("top_revenue_brands", []), "Top Revenue Brands", max_rows=max_rows, total_rows=len(revenue.get("top_revenue_brands", []))))
        if hhi:
            elems.extend(_table_from_records(hhi.get("top_brands_by_market_share", []), "Market Share Concentration", max_rows=max_rows, total_rows=len(hhi.get("top_brands_by_market_share", []))))
            elems.extend(_insight_box([
                f"HHI Score: {_format_value(hhi.get('hhi_score'))}",
                f"Structure: {hhi.get('market_structure_type', 'N/A')}",
                "Highly concentrated markets require differentiated entry strategies.",
            ], colors.HexColor("#e0f2fe")))
        if direct_competitors:
            elems.extend(_table_from_records(direct_competitors.get("direct_competitors", []), "Direct Competitors", max_rows=max_rows, total_rows=len(direct_competitors.get("direct_competitors", []))))
        if substitute:
            elems.extend(_table_from_records(substitute.get("substitute_products", []), "Substitute Threats", max_rows=max_rows, total_rows=len(substitute.get("substitute_products", []))))
        if complement:
            elems.extend(_table_from_records(complement.get("complement_products", []), "Complement Products", max_rows=max_rows, total_rows=len(complement.get("complement_products", []))))
        if bundle:
            elems.extend(_table_from_records(bundle.get("bundle_opportunities", []), "Bundle Opportunities", max_rows=max_rows, total_rows=len(bundle.get("bundle_opportunities", []))))
    else:
        elems.extend(_section_unavailable("Market Structure & Product Intelligence", "No product or market structure data available.", styles))
    elems.append(PageBreak())

    elems.extend(_section_header("Price Elasticity & Finance", "8"))
    if price_elasticity or finance:
        if price_elasticity:
            elems.extend(_text_block([
                "Price band revenue share = band revenue / total revenue × 100.",
                "Competition density reflects the number of offerings per price bucket.",
            ], styles))
            elems.extend(_table_from_records(price_elasticity.get("buckets", []), "Price Elasticity Buckets", max_rows=max_rows, total_rows=len(price_elasticity.get("buckets", []))))
        if finance:
            elems.extend(_table_from_kpi_pairs([
                ("Finance Health", finance.get("finance_health_score"), "Overall finance attractiveness."),
                ("Ad Pressure", finance.get("advertising_pressure", {}).get("score"), "Advertising competition."),
                ("Premium Viability", finance.get("premium_viability", {}).get("score"), "Premium pricing strength."),
                ("Margin Risk", finance.get("margin_compression", {}).get("risk"), "Margin pressure classification."),
                ("Capital Efficiency", finance.get("capital_efficiency", {}).get("score"), "Deployment efficiency."),
            ], "Finance Intelligence"))
            if finance.get("economic_attractiveness_matrix"):
                elems.extend(_table_from_records([finance.get("economic_attractiveness_matrix")], "Attractiveness Matrix", max_rows=1, total_rows=1))
    else:
        elems.extend(_section_unavailable("Price Elasticity & Finance", "Pricing and finance intelligence data unavailable.", styles))
    elems.append(PageBreak())

    elems.extend(_section_header("Risk & Recommendation", "9"))
    if risks:
        risk_rows = [{"Risk": _safe_cell_value(item, 80)} for item in risks[:max_rows]]
        elems.extend(_table_from_records(risk_rows, "Top Risks", max_rows=max_rows, total_rows=len(risks)))
    else:
        elems.extend(_section_unavailable("Risk Signals", "No risk signal data returned.", styles))

    recommendations: List[str] = []
    if final_verdict.get("launch_recommendation"):
        recommendations.append(f"Launch recommendation: {final_verdict.get('launch_recommendation')}")
    if final_verdict.get("market_rating"):
        recommendations.append(f"Market rating: {final_verdict.get('market_rating')}")
    if final_verdict.get("verdict"):
        recommendations.append(final_verdict.get("verdict"))
    if opportunities:
        recommendations.extend([f"- {item}" for item in opportunities[:max_rows]])
    if recommendations:
        elems.extend(_insight_box(recommendations, colors.HexColor("#ecfdf5")))
    else:
        elems.extend(_section_unavailable("Strategic Recommendations", "No strategic recommendations were generated.", styles))

    if include_appendix:
        elems.append(PageBreak())
        elems.extend(_section_header("Appendix", "10"))
        if siei.get("all_keywords"):
            elems.extend(_table_from_records(siei.get("all_keywords", []), "Extended Keyword Conversion Table", max_rows=max_rows, total_rows=len(siei.get("all_keywords", []))))
        if whitespace.get("entry_segments"):
            appendix_rows = [
                {
                    "segment": seg.get("segment"),
                    "keyword_count": _format_value(seg.get("keyword_count")),
                    "opportunity_revenue": _format_value(seg.get("opportunity_revenue")),
                }
                for seg in whitespace.get("entry_segments", [])[:max_rows]
            ]
            elems.extend(_table_from_records(appendix_rows, "Segment Keyword Drilldown Summary", max_rows=max_rows, total_rows=len(whitespace.get("entry_segments", []))))

    elems.append(Spacer(1, 10))
    elems.append(Paragraph(f"Report generated on {datetime.datetime.now().strftime('%Y-%m-%d %H:%M:%S')}", styles["BodyText"]))

    doc.build(elems, onFirstPage=_header_footer, onLaterPages=_header_footer)
    return output_path
