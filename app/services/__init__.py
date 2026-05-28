"""Service layer exports."""

from .dataset_registry import registry
from .report_builder import build_report

__all__ = [
    "registry",
    "build_report",
]
