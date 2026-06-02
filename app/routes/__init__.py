"""
Routes package.
"""
from app.routes.api import router
from app.routes.audit_endpoints import router as audit_router

__all__ = ["router", "audit_router"]
