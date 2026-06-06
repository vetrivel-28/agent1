"""Market Intelligence Agent FastAPI entry point."""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.routes import router, audit_router
from app.utils.logger import get_logger

logger = get_logger("main")

# ========================================================================
# Create FastAPI App
# ========================================================================

app = FastAPI(
    title="Market Intelligence Agent",
    description="Deterministic market intelligence system using Pandas + NumPy",
    version="2.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
    openapi_url="/openapi.json",
)

# ========================================================================
# CORS Middleware
# ========================================================================

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:5174",
        "http://127.0.0.1:5174",
        "http://localhost:5175",
        "http://127.0.0.1:5175",
        "http://localhost:5176",
        "http://127.0.0.1:5176",
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ========================================================================
# Include Routes
# ========================================================================

app.include_router(router)
app.include_router(audit_router)

# ========================================================================
# Startup / Shutdown Events
# ========================================================================


@app.on_event("startup")
async def startup_event():
    logger.info("=" * 70)
    logger.info("MARKET INTELLIGENCE AGENT STARTING")
    logger.info("=" * 70)
    logger.info("Swagger UI available at: http://localhost:8000/docs")
    logger.info("Endpoints available:")
    logger.info("  POST   /api/v1/upload-datasets")
    logger.info("  GET    /api/v1/health")
    logger.info("  GET    /api/v1/status")
    logger.info("  POST   /api/v1/demand-strength")
    logger.info("  POST   /api/v1/sales-momentum")
    logger.info("  POST   /api/v1/revenue-momentum")
    logger.info("  POST   /api/v1/bsr-efficiency")
    logger.info("  POST   /api/v1/market-report")
    logger.info("  POST   /api/v1/demand-velocity")
    logger.info("  POST   /api/v1/search-intent-efficiency")
    logger.info("  POST   /api/v1/market-concentration")
    logger.info("  POST   /api/v1/finance-intelligence")
    logger.info("")
    logger.info("AUDIT & EVIDENCE ENDPOINTS:")
    logger.info("  GET    /api/v1/audit/")
    logger.info("  GET    /api/v1/audit/datasets")
    logger.info("  GET    /api/v1/audit/quality")
    logger.info("  GET    /api/v1/audit/lineage/{metric_name}")
    logger.info("  GET    /api/v1/audit/all-evidence")
    logger.info("  GET    /api/v1/audit/metrics")
    logger.info("  GET    /api/v1/audit/segments")
    logger.info("  GET    /api/v1/audit/insights")
    logger.info("=" * 70)


@app.on_event("shutdown")
async def shutdown_event():
    logger.info("MARKET INTELLIGENCE AGENT SHUTTING DOWN")


# ========================================================================
# Root Endpoint
# ========================================================================


@app.get("/")
async def root():
    """Root endpoint — returns API info."""
    return {
        "name": "Market Intelligence Agent",
        "version": "2.0.0",
        "phase": "Deterministic Analysis",
        "docs_url": "/docs",
        "status_url": "/api/v1/status",
        "upload_url": "/api/v1/upload-datasets",
        "endpoints": {
            "demand_strength": "/api/v1/demand-strength",
            "sales_momentum": "/api/v1/sales-momentum",
            "revenue_momentum": "/api/v1/revenue-momentum",
            "bsr_efficiency": "/api/v1/bsr-efficiency",
            "market_report": "/api/v1/market-report",
            "demand_velocity": "/api/v1/demand-velocity",
            "search_intent_efficiency": "/api/v1/search-intent-efficiency",
            "market_concentration": "/api/v1/market-concentration",
            "finance_intelligence": "/api/v1/finance-intelligence",
        },
    }


# ========================================================================
# If run directly
# ========================================================================

if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "app.main:app",
        host="0.0.0.0",
        port=8000,
        reload=True,
        log_level="info",
    )
