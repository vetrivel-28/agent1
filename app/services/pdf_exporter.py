"""Deterministic PDF exporter for market report."""
from __future__ import annotations

import os
import tempfile
import datetime
from typing import Any, Dict, List

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

def _table_from_records(records: List[Dict[str, Any]], title: str, max_rows: int = 15) -> List[Any]:
    elems: List[Any] = []
    styles = getSampleStyleSheet()
    
    # Title styling
    title_style = ParagraphStyle(
        'TableTitle',
        parent=styles['Heading3'],
        fontSize=12,
        textColor=colors.HexColor("#1e293b"),
        spaceAfter=8
    )
    elems.append(Paragraph(f"<b>{title}</b>", title_style))
    
    if not records:
        elems.append(Paragraph("No data available for this section.", styles["BodyText"]))
        elems.append(Spacer(1, 15))
        return elems
        
    cols = list(records[0].keys())[:6]
    data = [cols]
    
    for row in records[:max_rows]:
        row_data = []
        for c in cols:
            val = row.get(c, "")
            if isinstance(val, float):
                val = f"{val:.2f}"
            row_data.append(str(val)[:40])
        data.append(row_data)
        
    table = Table(data, repeatRows=1)
    table.setStyle(
        TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#3b82f6")),
            ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
            ("ALIGN", (0, 0), (-1, 0), "CENTER"),
            ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
            ("FONTSIZE", (0, 0), (-1, 0), 10),
            ("BOTTOMPADDING", (0, 0), (-1, 0), 8),
            ("TOPPADDING", (0, 0), (-1, 0), 8),
            
            # Row styling
            ("BACKGROUND", (0, 1), (-1, -1), colors.white),
            ("TEXTCOLOR", (0, 1), (-1, -1), colors.HexColor("#334155")),
            ("ALIGN", (0, 1), (-1, -1), "LEFT"),
            ("FONTNAME", (0, 1), (-1, -1), "Helvetica"),
            ("FONTSIZE", (0, 1), (-1, -1), 9),
            ("BOTTOMPADDING", (0, 1), (-1, -1), 6),
            ("TOPPADDING", (0, 1), (-1, -1), 6),
            
            # Alternating row colors
            *([("BACKGROUND", (0, i), (-1, i), colors.HexColor("#f8fafc")) for i in range(2, len(data), 2)]),
            
            # Grid
            ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#e2e8f0")),
            ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ])
    )
    elems.append(table)
    elems.append(Spacer(1, 20))
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

def export_market_report_pdf(report: Dict[str, Any]) -> str:
    fd, output_path = tempfile.mkstemp(prefix="market_report_", suffix=".pdf")
    os.close(fd)
    
    doc = SimpleDocTemplate(
        output_path, 
        pagesize=letter, 
        leftMargin=50, 
        rightMargin=50, 
        topMargin=50, 
        bottomMargin=50
    )
    
    styles = getSampleStyleSheet()
    elems: List[Any] = []
    
    results = report.get("results", {})
    
    # Extract data securely
    exec_summary = results.get("executive_summary", {})
    market_health = results.get("market_health", {})
    demand = results.get("demand_analysis", {})
    brand = results.get("brand_momentum", {})
    revenue = results.get("revenue_analysis", {})
    bsr = results.get("bsr_efficiency_analysis", {})
    opportunities = results.get("opportunity_signals", {}).get("signals", [])
    risks = results.get("risk_signals", {}).get("signals", [])
    final_verdict = results.get("final_market_verdict", {}).get("verdict", "")
    
    siei = results.get("siei", {})
    whitespace = results.get("whitespace", {})
    direct_competitors = results.get("direct_competitors", {})
    price_elasticity = results.get("price_elasticity", {})
    hhi = results.get("hhi", {})
    demand_velocity = results.get("demand_velocity", {})
    substitute = results.get("substitute_intelligence", {})
    complement = results.get("complement_intelligence", {})
    bundle = results.get("bundle_opportunities", {})
    finance = results.get("finance_intelligence", {})
    attractiveness_matrix = results.get("economic_attractiveness_matrix", {})
    if not attractiveness_matrix:
        attractiveness_matrix = finance.get("economic_attractiveness_matrix", {})
    final_verdict_full = results.get("final_market_verdict", {})

    # ==========================================
    # 1. COVER PAGE
    # ==========================================
    title_style = ParagraphStyle(
        'MainTitle',
        parent=styles['Title'],
        fontSize=32,
        textColor=colors.HexColor("#0f172a"),
        spaceAfter=20,
        alignment=TA_CENTER
    )
    
    subtitle_style = ParagraphStyle(
        'SubTitle',
        parent=styles['Normal'],
        fontSize=14,
        textColor=colors.HexColor("#64748b"),
        spaceAfter=50,
        alignment=TA_CENTER
    )
    
    elems.append(Spacer(1, 100))
    elems.append(Paragraph("<b>Market Intelligence Report</b>", title_style))
    elems.append(Paragraph("Comprehensive Analysis & Strategic Insights", subtitle_style))
    
    elems.append(Spacer(1, 40))
    
    # Highlight Metrics Box
    cover_data = [
        ["Generated Date", datetime.datetime.now().strftime("%B %d, %Y")],
        ["Composite Score", f"{exec_summary.get('composite_market_health_score', 0)} / 100"],
        ["Market Direction", str(market_health.get('market_direction', 'N/A')).title()],
        ["Analyzed Brands", str(results.get("market_overview", {}).get("total_brands_analysed", "N/A"))]
    ]
    
    cover_table = Table(cover_data, colWidths=[200, 200])
    cover_table.setStyle(TableStyle([
        ('ALIGN', (0,0), (-1,-1), 'CENTER'),
        ('FONTNAME', (0,0), (0,-1), 'Helvetica-Bold'),
        ('TEXTCOLOR', (0,0), (-1,-1), colors.HexColor("#334155")),
        ('BACKGROUND', (0,0), (-1,-1), colors.HexColor("#f1f5f9")),
        ('GRID', (0,0), (-1,-1), 0.5, colors.HexColor("#cbd5e1")),
        ('PADDING', (0,0), (-1,-1), 12),
    ]))
    elems.append(cover_table)
    
    elems.append(PageBreak())

    # ==========================================
    # 2. EXECUTIVE SUMMARY
    # ==========================================
    elems.extend(_section_header("Executive Summary", "2"))
    market_econ = exec_summary.get("market_economics", "")
    if market_econ:
        elems.append(Paragraph("<b>Market Economics</b>", styles["Heading4"]))
        elems.append(Paragraph(market_econ, styles["BodyText"]))
        elems.append(Spacer(1, 12))

    summary_data = [
        [
            Paragraph("<b>Demand Score</b>", styles['Normal']), 
            Paragraph(f"{demand.get('demand_score', 0)}", styles['Normal']),
            Paragraph("<b>Sales Momentum</b>", styles['Normal']),
            Paragraph(f"{brand.get('sales_momentum_score', 0)}", styles['Normal'])
        ],
        [
            Paragraph("<b>Revenue Momentum</b>", styles['Normal']), 
            Paragraph(f"{revenue.get('revenue_momentum_score', 0)}", styles['Normal']),
            Paragraph("<b>BSR Efficiency</b>", styles['Normal']),
            Paragraph(f"{bsr.get('bsr_efficiency_score', 0)}", styles['Normal'])
        ],
        [
            Paragraph("<b>Whitespace Score</b>", styles['Normal']), 
            Paragraph(f"{whitespace.get('overall_whitespace_score', 0)}", styles['Normal']),
            Paragraph("<b>Ecosystem Strength</b>", styles['Normal']),
            Paragraph(f"{bundle.get('ecosystem_strength', 0)}", styles['Normal'])
        ],
        [
            Paragraph("<b>Finance Health</b>", styles['Normal']),
            Paragraph(f"{finance.get('finance_health_score', results.get('engine_scores', {}).get('finance_health', 0))}", styles['Normal']),
            Paragraph("<b>Final Market Score</b>", styles['Normal']),
            Paragraph(f"{exec_summary.get('final_market_score', exec_summary.get('composite_market_health_score', 0))}", styles['Normal'])
        ],
    ]
    
    summary_table = Table(summary_data)
    summary_table.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,-1), colors.HexColor("#f8fafc")),
        ('GRID', (0,0), (-1,-1), 0.5, colors.HexColor("#e2e8f0")),
        ('PADDING', (0,0), (-1,-1), 10),
        ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
    ]))
    elems.append(summary_table)
    elems.append(Spacer(1, 20))

    # ==========================================
    # 3. DEMAND ANALYSIS
    # ==========================================
    elems.extend(_section_header("Demand Analysis", "3"))
    elems.append(Paragraph(f"<b>Demand Direction:</b> {market_health.get('demand_direction_signal', 'N/A')}", styles["BodyText"]))
    elems.append(Spacer(1, 10))
    elems.extend(_table_from_records(demand.get("top_demand_keywords", []), "Top Demand Keywords"))
    
    if demand_velocity:
        elems.append(Paragraph(f"<b>Velocity Score:</b> {demand_velocity.get('velocity_score', 0)}/100", styles["BodyText"]))
        elems.append(Spacer(1, 10))
        elems.extend(_table_from_records(demand_velocity.get("strongest_growth_signals", []), "Strongest Velocity Signals"))

    if whitespace:
        elems.extend(_table_from_records(whitespace.get("top_opportunities", []), "Whitespace SEO Opportunities"))

    # ==========================================
    # 4. SALES ANALYSIS
    # ==========================================
    elems.extend(_section_header("Sales Analysis", "4"))
    elems.append(Paragraph(f"<b>Sales Direction:</b> {market_health.get('sales_direction', 'N/A')}", styles["BodyText"]))
    elems.append(Spacer(1, 10))
    elems.extend(_table_from_records(brand.get("fastest_growing_brands", []), "Fastest Growing Brands (Momentum)"))
    elems.extend(_table_from_records(brand.get("declining_brands", []), "Declining Brands"))

    # ==========================================
    # 5. REVENUE ANALYSIS
    # ==========================================
    elems.extend(_section_header("Revenue Analysis", "5"))
    total_rev = revenue.get('total_market_revenue', 0)
    elems.append(Paragraph(f"<b>Total Analyzed Market Revenue:</b> ${total_rev:,.2f}", styles["BodyText"]))
    elems.append(Spacer(1, 10))
    elems.extend(_table_from_records(revenue.get("top_revenue_brands", []), "Top Revenue Growth Brands"))

    # ==========================================
    # 6. BSR EFFICIENCY
    # ==========================================
    elems.extend(_section_header("BSR Efficiency", "6"))
    elems.extend(_table_from_records(bsr.get("most_efficient_products", []), "Most Efficient Products (High Revenue, Poor Rank)"))
    elems.extend(_table_from_records(bsr.get("least_efficient_products", []), "Least Efficient Products (High Rank, Poor Revenue)"))

    # ==========================================
    # 7. SEARCH INTELLIGENCE
    # ==========================================
    elems.extend(_section_header("Search Intelligence", "7"))
    if siei:
        elems.extend(_table_from_records(siei.get("highest_efficiency_keywords", []), "High Intent Efficiency (SIEI)"))
        
    if substitute:
        elems.extend(_table_from_records(substitute.get("substitute_products", []), "Top Substitute Threats"))

    # ==========================================
    # 8. MARKET STRUCTURE
    # ==========================================
    elems.extend(_section_header("Market Structure", "8"))
    if hhi:
        elems.append(Paragraph(f"<b>HHI Score:</b> {hhi.get('hhi_score', 0)} ({hhi.get('market_structure_type', 'N/A')})", styles["BodyText"]))
        elems.append(Spacer(1, 10))
        elems.extend(_table_from_records(hhi.get("top_brands_by_market_share", []), "Market Share Concentration"))

    if direct_competitors:
        elems.append(Paragraph(f"<b>Average Similarity:</b> {direct_competitors.get('average_similarity', 0)}/100", styles["BodyText"]))
        elems.extend(_table_from_records(direct_competitors.get("similarity_rankings", []), "Direct Competitors"))

    if price_elasticity:
        elems.extend(_table_from_records(price_elasticity.get("buckets", []), "Price Elasticity & Demand Buckets"))
        if price_elasticity.get("dead_zones"):
            elems.append(Paragraph("<b>Identified Price Dead Zones:</b>", styles["Heading4"]))
            for dz in price_elasticity.get("dead_zones", []):
                elems.append(Paragraph(f"- {dz}", styles["BodyText"]))
            elems.append(Spacer(1, 10))

    # ==========================================
    # 9. ECOSYSTEM INTELLIGENCE
    # ==========================================
    elems.extend(_section_header("Ecosystem Intelligence", "9"))
    if complement:
        elems.extend(_table_from_records(complement.get("complement_products", []), "Top Complementary Products"))
    if bundle:
        elems.extend(_table_from_records(bundle.get("bundle_opportunities", []), "High Potential Bundle Opportunities"))

    # ==========================================
    # 10. FINANCE INTELLIGENCE
    # ==========================================
    elems.extend(_section_header("Finance Intelligence", "10"))
    if finance:
        elems.extend(_score_card(
            "Finance Health Score",
            f"{finance.get('finance_health_score', 0)} / 100",
            finance.get("economic_attractiveness", ""),
        ))
        api = finance.get("advertising_pressure", {})
        pvs = finance.get("premium_viability", {})
        mcr = finance.get("margin_compression", {})
        ces = finance.get("capital_efficiency", {})
        eci = finance.get("entry_cost", {})
        finance_kpis = [
            ("Advertising Pressure", api.get("score"), api.get("classification")),
            ("Premium Viability", pvs.get("score"), pvs.get("classification")),
            ("Margin Compression Risk", mcr.get("score"), mcr.get("risk")),
            ("Capital Efficiency", ces.get("score"), ces.get("classification")),
            ("Entry Cost Index", eci.get("score"), eci.get("classification")),
        ]
        kpi_rows = [["Metric", "Score", "Classification"]]
        for name, score, label in finance_kpis:
            kpi_rows.append([
                name,
                str(score) if score is not None else "N/A",
                str(label or "N/A"),
            ])
        kpi_table = Table(kpi_rows, colWidths=[180, 80, 160])
        kpi_table.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#1e40af")),
            ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
            ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#e2e8f0")),
            ("FONTSIZE", (0, 0), (-1, -1), 9),
            ("PADDING", (0, 0), (-1, -1), 8),
        ]))
        elems.append(kpi_table)
        elems.append(Spacer(1, 12))
        heatmap = pvs.get("price_elasticity_heatmap", [])
        if heatmap:
            elems.extend(_table_from_records(heatmap, "Premium Viability — Price Band Heatmap"))
        if attractiveness_matrix:
            matrix_rows = [
                ["Dimension", "Value"],
                ["Finance Health (X)", str(attractiveness_matrix.get("finance_health", "N/A"))],
                ["Demand Strength (Y)", str(attractiveness_matrix.get("demand_strength", "N/A"))],
                ["Quadrant", str(attractiveness_matrix.get("quadrant", "N/A"))],
                ["Recommendation", str(attractiveness_matrix.get("launch_recommendation", "N/A"))],
            ]
            matrix_table = Table(matrix_rows, colWidths=[160, 300])
            matrix_table.setStyle(TableStyle([
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#0f172a")),
                ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#e2e8f0")),
                ("FONTSIZE", (0, 0), (-1, -1), 9),
                ("PADDING", (0, 0), (-1, -1), 8),
            ]))
            elems.append(Paragraph("<b>Market Attractiveness Matrix</b>", styles["Heading4"]))
            elems.append(matrix_table)
            elems.append(Spacer(1, 12))
        verdict_text = finance.get("economic_verdict", "")
        if verdict_text:
            elems.append(Paragraph(f"<b>Market Entry Verdict:</b> {verdict_text}", styles["BodyText"]))
            elems.append(Spacer(1, 10))
    else:
        elems.append(Paragraph("Finance Intelligence data not available.", styles["BodyText"]))

    elems.append(PageBreak())

    # ==========================================
    # 11. OPPORTUNITY ANALYSIS
    # ==========================================
    elems.extend(_section_header("Opportunity Analysis", "11"))
    if opportunities:
        for opp in opportunities:
            elems.append(Paragraph(f"• {opp}", styles["BodyText"]))
            elems.append(Spacer(1, 5))
    else:
        elems.append(Paragraph("No specific data-driven opportunities detected.", styles["BodyText"]))
    elems.append(Spacer(1, 15))

    # ==========================================
    # 12. RISK ANALYSIS
    # ==========================================
    elems.extend(_section_header("Risk Analysis", "12"))
    if risks:
        for risk in risks:
            elems.append(Paragraph(f"• {risk}", styles["BodyText"]))
            elems.append(Spacer(1, 5))
    else:
        elems.append(Paragraph("No critical risks detected.", styles["BodyText"]))
    elems.append(Spacer(1, 15))

    # ==========================================
    # 13. FINAL MARKET VERDICT
    # ==========================================
    elems.extend(_section_header("Final Market Verdict", "13"))
    verdict_style = ParagraphStyle(
        'Verdict',
        parent=styles['Normal'],
        fontSize=14,
        leading=20,
        textColor=colors.HexColor("#1e293b"),
        fontName="Helvetica-Bold",
        backColor=colors.HexColor("#f0fdf4"),
        borderPadding=15,
        borderColor=colors.HexColor("#bbf7d0"),
        borderWidth=1,
        borderRadius=8
    )
    elems.append(Paragraph(final_verdict, verdict_style))
    if final_verdict_full.get("market_rating"):
        elems.append(Spacer(1, 8))
        elems.append(Paragraph(
            f"<b>Market Rating:</b> {final_verdict_full.get('market_rating')} | "
            f"<b>Launch:</b> {final_verdict_full.get('launch_recommendation', '')}",
            styles["BodyText"],
        ))
    if final_verdict_full.get("finance_contribution"):
        elems.append(Paragraph(final_verdict_full["finance_contribution"], styles["BodyText"]))
    if final_verdict_full.get("economic_risk"):
        elems.append(Paragraph(final_verdict_full["economic_risk"], styles["BodyText"]))

    doc.build(elems, onFirstPage=_header_footer, onLaterPages=_header_footer)
    return output_path
