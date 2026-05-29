"""
Central dataset schemas for schema-driven identification.

Identification uses column fingerprints only — never filenames.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Dict, List

from app.utils.column_mapper import find_column


@dataclass(frozen=True)
class DatasetSchema:
    dataset_type: str
    display_name: str
    required_any: List[List[str]]
    optional_groups: List[List[str]] = field(default_factory=list)
    min_required_groups: int = 1
    min_rows: int = 1

    def score_match(self, df) -> tuple[float, List[str], List[str]]:
        """Return (confidence 0-1, matched_columns, missing_required_groups)."""
        if df is None or df.empty or len(df) < self.min_rows:
            return 0.0, [], ["empty dataset"]

        matched: List[str] = []
        missing_groups: List[str] = []
        groups_found = 0

        for group in self.required_any:
            col = find_column(df, group)
            if col:
                groups_found += 1
                matched.append(col)
            else:
                missing_groups.append(group[0])

        if groups_found < self.min_required_groups:
            base = groups_found / max(self.min_required_groups, 1) * 0.6
            return base, matched, missing_groups

        optional_found = 0
        for group in self.optional_groups:
            if find_column(df, group):
                optional_found += 1
                matched.append(find_column(df, group) or group[0])

        opt_boost = 0.0
        if self.optional_groups:
            opt_boost = (optional_found / len(self.optional_groups)) * 0.4

        confidence = min(1.0, 0.6 + opt_boost) if groups_found >= self.min_required_groups else 0.0
        return confidence, list(dict.fromkeys(matched)), missing_groups


BLACKBOX_SCHEMA = DatasetSchema(
    dataset_type="blackbox",
    display_name="Product Catalog (BlackBox-style)",
    required_any=[
        ["ASIN", "asin"],
        ["Title", "title", "Product Title"],
        ["Price", "price", "List Price"],
    ],
    optional_groups=[
        ["BSR", "bsr", "Best Sellers Rank", "Best Seller Rank"],
        ["ASIN Revenue", "asin revenue", "Revenue", "revenue", "Parent Level Revenue"],
        ["ASIN Sales", "asin sales", "Parent Level Sales"],
        ["Brand", "brand"],
        ["Active Sellers", "active sellers", "Sellers"],
        ["Storage Fee Jan-Sep", "storage fee jan-sep"],
        ["Storage Fee Oct-Dec", "storage fee oct-dec"],
        ["Sales Trend (90 days) (%)", "Sales Trend", "sales trend"],
    ],
    min_required_groups=3,
)

MAGNET_SCHEMA = DatasetSchema(
    dataset_type="magnet",
    display_name="Keyword Intelligence (Magnet-style)",
    required_any=[
        ["Keyword Phrase", "Keyword", "keyword"],
        ["Search Volume", "search volume", "Monthly Search Volume"],
    ],
    optional_groups=[
        ["CPR", "cpr"],
        ["H10 PPC Sugg. Bid", "PPC Sugg. Bid", "Suggested PPC Bid"],
        ["Competing Products", "competing products"],
        ["Title Density", "title density"],
        ["Sponsored ASINs", "sponsored asins"],
        ["Keyword Sales", "keyword sales"],
        ["Search Volume Trend", "search volume trend"],
        ["ABA Total Click Share", "Click Share"],
        ["ABA Total Conv. Share", "ABA Total Conversion Share"],
    ],
    min_required_groups=2,
)

KEYWORD_CLASSIFICATION_SCHEMA = DatasetSchema(
    dataset_type="keyword_classification",
    display_name="Keyword Classification",
    required_any=[
        ["keyword", "Keyword", "Keyword Phrase"],
        ["classification", "Classification"],
    ],
    optional_groups=[
        ["monthly_search_volume", "Search Volume", "monthly search volume"],
    ],
    min_required_groups=2,
)

ALL_SCHEMAS: List[DatasetSchema] = [
    BLACKBOX_SCHEMA,
    MAGNET_SCHEMA,
    KEYWORD_CLASSIFICATION_SCHEMA,
]

SCHEMA_BY_TYPE: Dict[str, DatasetSchema] = {s.dataset_type: s for s in ALL_SCHEMAS}
