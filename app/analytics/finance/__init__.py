"""Finance Intelligence analytics modules."""

from app.analytics.finance.advertising_pressure import compute_advertising_pressure
from app.analytics.finance.capital_efficiency import compute_capital_efficiency
from app.analytics.finance.entry_cost import compute_entry_cost
from app.analytics.finance.margin_compression import compute_margin_compression
from app.analytics.finance.premium_viability import compute_premium_viability

__all__ = [
    "compute_advertising_pressure",
    "compute_capital_efficiency",
    "compute_entry_cost",
    "compute_margin_compression",
    "compute_premium_viability",
]
