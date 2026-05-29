"""Deterministic PDF exporter for market report."""
from __future__ import annotations

import os
import tempfile
from typing import Any, Dict, List

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle


def _table_from_records(records: List[Dict[str, Any]], title: str, max_rows: int = 12) -> List[Any]:
    elems: List[Any] = []
    styles = getSampleStyleSheet()
    elems.append(Paragraph(f"<b>{title}</b>", styles["Heading3"]))
    if not records:
        elems.append(Paragraph("No data available.", styles["BodyText"]))
        elems.append(Spacer(1, 8))
        return elems
    cols = list(records[0].keys())[:6]
    data = [cols]
    for row in records[:max_rows]:
        data.append([str(row.get(c, ""))[:40] for c in cols])
    table = Table(data, repeatRows=1)
    table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#E5E7EB")),
                ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#D1D5DB")),
                ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ]
        )
    )
    elems.append(table)
    elems.append(Spacer(1, 10))
    return elems


def export_market_report_pdf(report: Dict[str, Any]) -> str:
    styles = getSampleStyleSheet()
    fd, output_path = tempfile.mkstemp(prefix="market_report_", suffix=".pdf")
    os.close(fd)
    doc = SimpleDocTemplate(output_path, pagesize=A4, leftMargin=36, rightMargin=36, topMargin=36, bottomMargin=36)
    elems: List[Any] = []

    results = report.get("results", {})
    exec_summary = results.get("executive_summary", {})
    market_health = results.get("market_health", {})
    demand = results.get("demand_analysis", {})
    brand = results.get("brand_momentum", {})
    revenue = results.get("revenue_analysis", {})
    bsr = results.get("bsr_efficiency_analysis", {})
    opportunities = results.get("opportunity_signals", {}).get("signals", [])
    risks = results.get("risk_signals", {}).get("signals", [])
    final_verdict = results.get("final_market_verdict", {}).get("verdict", "")

    elems.append(Paragraph("<b>Market Intelligence Report</b>", styles["Title"]))
    elems.append(Spacer(1, 8))
    elems.append(Paragraph(f"Summary: {report.get('summary', '')}", styles["BodyText"]))
    elems.append(Paragraph(f"Composite Score: {exec_summary.get('composite_market_health_score', 0)} / 100", styles["BodyText"]))
    elems.append(Paragraph(f"Data Reliability Score: {market_health.get('data_reliability_score', 0)} / 100", styles["BodyText"]))
    elems.append(Paragraph(f"Market Direction: {market_health.get('market_direction', 'n/a')}", styles["BodyText"]))
    elems.append(Spacer(1, 12))

    elems.extend(_table_from_records(demand.get("top_demand_keywords", []), "Demand Analysis - Top Keywords"))
    elems.extend(_table_from_records(brand.get("fastest_growing_brands", []), "Brand Momentum - Growth Leaders"))
    elems.extend(_table_from_records(revenue.get("top_revenue_brands", []), "Revenue Analysis - Top Revenue Brands"))
    elems.extend(_table_from_records(bsr.get("most_efficient_products", []), "BSR Efficiency - Top Efficient Products"))

    elems.append(Paragraph("<b>Opportunity Signals</b>", styles["Heading3"]))
    for item in opportunities[:10]:
        elems.append(Paragraph(f"- {item}", styles["BodyText"]))
    elems.append(Spacer(1, 8))

    elems.append(Paragraph("<b>Risk Signals</b>", styles["Heading3"]))
    for item in risks[:10]:
        elems.append(Paragraph(f"- {item}", styles["BodyText"]))
    elems.append(Spacer(1, 8))

    elems.append(Paragraph("<b>Final Market Verdict</b>", styles["Heading3"]))
    elems.append(Paragraph(final_verdict, styles["BodyText"]))

    doc.build(elems)
    return output_path

