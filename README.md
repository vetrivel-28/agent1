# Market Intelligence Agent - Phase 1

A **deterministic, dataset-driven market intelligence system** built with FastAPI, Pandas, and NumPy.

## Overview

This system analyzes market intelligence data through four specialized analysis engines:

1. **Demand Strength** — Measures overall market demand health
2. **Sales Momentum** — Measures brand-level sales acceleration  
3. **Revenue Momentum** — Measures revenue acceleration by brand
4. **BSR Efficiency** — Measures revenue efficiency relative to BSR rank

All analysis is **deterministic, data-driven, and traceable**. No hallucinated insights, no hardcoded thresholds, no invented columns.

---

## Key Features

✅ **Deterministic Output** — Same dataset always produces same results  
✅ **No Hallucinations** — Every insight traces back to dataset values  
✅ **Column Traceability** — Every metric includes dataset source & formula  
✅ **Safe Normalization** — Handles divide-by-zero, NaN, and edge cases  
✅ **Percentile-Based Classification** — No hardcoded thresholds  
✅ **Structured Validation** — Returns error responses instead of crashing  
✅ **Swagger UI** — Full OpenAPI documentation and interactive testing  
✅ **Modular Architecture** — Separate engines, routes, validators, services  

---

## Tech Stack

- **FastAPI** — Modern async web framework
- **Pandas** — Data manipulation & analysis
- **NumPy** — Numerical computations
- **Pydantic** — Data validation & serialization
- **Uvicorn** — ASGI server
- **Python 3.8+**

---

## Installation

### 1. Clone or Setup Project
```bash
cd D:\profitstory\market_intelligence_agent
```

### 2. Create Virtual Environment (Recommended)

**Windows (PowerShell):**
```powershell
python -m venv venv
.\venv\Scripts\Activate.ps1
```

**Windows (CMD):**
```cmd
python -m venv venv
venv\Scripts\activate.bat
```

**macOS/Linux:**
```bash
python3 -m venv venv
source venv/bin/activate
```

### 3. Install Dependencies
```bash
pip install -r requirements.txt
```

---

## Running the Server

### Option 1: Using run.bat (Windows Only)
```cmd
double-click run.bat
```

### Option 2: Manual Startup
```bash
uvicorn app.main:app --reload
```

### Option 3: Production Mode
```bash
uvicorn app.main:app --host 0.0.0.0 --port 8000
```

The API will start at **http://localhost:8000**

---

## API Endpoints

### 1. Health & Status

#### GET `/`
Returns API info and available endpoints.

**Response:**
```json
{
  "name": "Market Intelligence Agent",
  "version": "1.0.0",
  "docs_url": "/docs",
  "endpoints": {
    "demand_strength": "/api/v1/demand-strength",
    "sales_momentum": "/api/v1/sales-momentum",
    "revenue_momentum": "/api/v1/revenue-momentum",
    "bsr_efficiency": "/api/v1/bsr-efficiency"
  }
}
```

#### GET `/api/v1/health`
Quick health check with dataset status.

**Response:**
```json
{
  "status": "ok",
  "message": "Market Intelligence Agent is running",
  "datasets_loaded": {
    "blackbox": false,
    "magnet": false,
    "keyword_classification": false
  }
}
```

#### GET `/api/v1/status`
Detailed status including row counts and column names.

**Response:**
```json
{
  "status": "ok",
  "datasets": { ... },
  "metadata": { ... },
  "rows_loaded": { "blackbox": 1000, "magnet": 5000 }
}
```

---

### 2. Dataset Management

#### POST `/api/v1/upload-datasets`
Upload CSV datasets. Accepts up to 3 files.

**Files (all optional):**
- `blackbox` — BlackBox Products CSV
- `magnet` — Magnet Keyword CSV
- `keyword_classification` — Keyword Classification CSV

**Request (multipart/form-data):**
```
POST /api/v1/upload-datasets
Files:
  blackbox: [blackbox_data.csv]
  magnet: [magnet_data.csv]
```

**Response (Success):**
```json
{
  "status": "success",
  "message": "All requested datasets uploaded successfully",
  "datasets_loaded": {
    "blackbox": true,
    "magnet": true,
    "keyword_classification": false
  },
  "rows_loaded": {
    "blackbox": 1523,
    "magnet": 8940
  },
  "errors": null
}
```

**Response (Error):**
```json
{
  "status": "error",
  "message": "Some datasets failed to upload",
  "datasets_loaded": { ... },
  "errors": [
    {
      "status": "error",
      "dataset": "blackbox",
      "message": "Could not parse CSV..."
    }
  ]
}
```

**Validation Checks:**
- Empty file detection
- Invalid CSV format detection
- Duplicate columns removed
- Whitespace trimmed from column names
- Data type validation

---

### 3. Analysis Endpoints

#### POST `/api/v1/demand-strength`
Measure overall market demand health.

**Query Parameters:**
- `top_n` (int, default=10) — Number of top results to return

**Formula:**
```
Demand Strength = mean( 
    normalized_search_volume,
    normalized_keyword_sales,
    normalized_asin_sales,
    normalized_revenue
)

Each metric min-max normalized to 0-100
```

**Datasets Used:**
- Magnet Keyword dataset (Search Volume, Keyword Sales)
- BlackBox dataset (ASIN Sales, Revenue)

**Response:**
```json
{
  "status": "success",
  "metric_name": "Demand Strength",
  "summary": "Strong market demand detected. High search volume...",
  "datasets_used": ["magnet", "blackbox"],
  "columns_used": ["Search Volume", "Keyword Sales", "ASIN Sales", "Revenue"],
  "formula_used": "...",
  "results": {
    "overall_demand_score": 73.45,
    "metrics_available": ["Search Volume", "Keyword Sales", "ASIN Sales", "Revenue"],
    "metric_contributions": {
      "Search Volume": 68.2,
      "Keyword Sales": 75.1,
      "ASIN Sales": 70.3,
      "Revenue": 79.2
    },
    "top_keywords": [
      {
        "keyword": "laptop computer",
        "search_volume": 12500,
        "keyword_sales": 450
      },
      ...
    ],
    "top_products": [
      {
        "asin": "B0123456789",
        "title": "Product Title (120 chars max)",
        "asin_sales": 5000,
        "revenue": 125000.50
      },
      ...
    ]
  },
  "validation": {}
}
```

---

#### POST `/api/v1/sales-momentum`
Measure brand-level sales acceleration.

**Formula:**
```
Sales Momentum = mean(
    normalized_sales_trend,
    normalized_asin_sales
)

Aggregated at brand level (never ASIN vs ASIN)
Each metric min-max normalized to 0-100
```

**Dataset Used:**
- BlackBox dataset (Brand, Sales Trend %, ASIN Sales)

**Response:**
```json
{
  "status": "success",
  "metric_name": "Sales Momentum",
  "summary": "Market sales momentum is accelerating. Mean brand momentum score: 62.34/100...",
  "datasets_used": ["blackbox"],
  "columns_used": ["Brand", "Sales Trend (%)", "ASIN Sales"],
  "formula_used": "...",
  "results": {
    "market_momentum_direction": "Accelerating",
    "market_mean_score": 62.34,
    "market_median_score": 64.12,
    "total_brands_analysed": 156,
    "brands_analyzed": 156,
    "fastest_growing_brands": [
      {
        "brand": "Brand A",
        "momentum_score": 88.5,
        "avg_sales_trend_pct": 25.3,
        "total_asin_sales": 450000
      },
      ...
    ],
    "declining_brands": [
      {
        "brand": "Brand Z",
        "momentum_score": 12.3,
        "avg_sales_trend_pct": -8.5,
        "total_asin_sales": 15000
      },
      ...
    ]
  },
  "validation": {}
}
```

---

#### POST `/api/v1/revenue-momentum`
Measure revenue acceleration by brand.

**Formula:**
```
Revenue Momentum = mean(
    normalized_revenue,
    normalized_revenue_trend
)

Aggregated at brand level
Each metric min-max normalized to 0-100
Supports partial analysis if trend data unavailable
```

**Dataset Used:**
- BlackBox dataset (Brand, ASIN Revenue, Revenue Trend %)

**Response:**
```json
{
  "status": "success",
  "metric_name": "Revenue Momentum",
  "summary": "Market revenue momentum is growing. Mean brand revenue score: 58.12/100...",
  "datasets_used": ["blackbox"],
  "columns_used": ["Brand", "ASIN Revenue", "Revenue Trend (%)"],
  "formula_used": "...",
  "results": {
    "market_revenue_direction": "Growing",
    "market_mean_score": 58.12,
    "market_median_score": 61.45,
    "total_market_revenue": 45678900.50,
    "total_brands_analysed": 156,
    "partial_analysis": false,
    "top_revenue_growth_brands": [
      {
        "brand": "Brand A",
        "revenue_momentum_score": 85.3,
        "total_revenue": 2500000,
        "avg_revenue_trend_pct": 18.5
      },
      ...
    ],
    "declining_revenue_brands": [
      {
        "brand": "Brand Z",
        "revenue_momentum_score": 15.2,
        "total_revenue": 180000,
        "avg_revenue_trend_pct": -12.3
      },
      ...
    ]
  },
  "validation": {}
}
```

---

#### POST `/api/v1/bsr-efficiency`
Measure revenue efficiency relative to BSR rank.

**Formula:**
```
Step 1 — Normalize BSR (invert so higher = better):
  Normalized BSR = (1 - BSR / max_BSR) * 100

Step 2 — Normalize Revenue (min-max 0-100):
  Normalized Revenue = (Revenue - min) / (max - min) * 100

Step 3 — Efficiency Score:
  Efficiency = (Normalized Revenue × 0.6) + (Normalized BSR × 0.4)

Classification: Percentile-based (p75 = efficient, p25 = inefficient)
```

**Dataset Used:**
- BlackBox dataset (Revenue, BSR, ASIN, Title, Brand)

**Response:**
```json
{
  "status": "success",
  "metric_name": "BSR Efficiency",
  "summary": "High market efficiency. Top products achieve strong revenue...",
  "datasets_used": ["blackbox"],
  "columns_used": ["Revenue", "BSR", "ASIN", "Title", "Brand"],
  "formula_used": "...",
  "results": {
    "market_efficiency_score": 71.23,
    "market_median_efficiency": 72.55,
    "total_products_analysed": 1523,
    "efficient_products_count": 381,
    "inefficient_products_count": 381,
    "efficient_products": [
      {
        "efficiency_score": 92.5,
        "bsr": 245,
        "revenue": 185000,
        "norm_bsr": 88.3,
        "norm_revenue": 95.2,
        "asin": "B0123456789",
        "title": "Product Title...",
        "brand": "Brand A"
      },
      ...
    ],
    "inefficient_products": [
      {
        "efficiency_score": 8.2,
        "bsr": 450000,
        "revenue": 500,
        "norm_bsr": 1.2,
        "norm_revenue": 0.5,
        "asin": "B9876543210",
        "title": "Product Title...",
        "brand": "Brand Z"
      },
      ...
    ],
    "bsr_distribution": {
      "min_bsr": 1,
      "max_bsr": 999999,
      "median_bsr": 5432,
      "mean_bsr": 45123.5
    },
    "revenue_distribution": {
      "min_revenue": 50,
      "max_revenue": 5000000,
      "median_revenue": 125000,
      "mean_revenue": 300000
    }
  },
  "validation": {}
}
```

---

## Swagger UI

Interactive API documentation is available at:

**http://localhost:8000/docs**

Features:
- Try all endpoints directly
- View request/response schemas
- Test with real data
- See example responses

---

## Error Handling

All endpoints return structured error responses (no crashes):

**If Datasets Not Uploaded:**
```json
{
  "status": "error",
  "metric_name": "Demand Strength",
  "summary": "Datasets not uploaded",
  "datasets_used": [],
  "columns_used": [],
  "formula_used": "...",
  "results": {},
  "validation": {
    "error": "Please upload Magnet and/or BlackBox datasets first"
  }
}
```

**If Required Columns Missing:**
```json
{
  "status": "error",
  "metric_name": "Sales Momentum",
  "summary": "Analysis failed",
  "datasets_used": ["blackbox"],
  "columns_used": [],
  "formula_used": "...",
  "results": {},
  "validation": {
    "missing_columns": ["Brand", "Sales Trend (%)"]
  }
}
```

**If CSV Upload Fails:**
```json
{
  "status": "partial",
  "message": "Some datasets uploaded successfully",
  "datasets_loaded": {
    "blackbox": true,
    "magnet": false,
    "keyword_classification": false
  },
  "errors": [
    {
      "status": "error",
      "dataset": "magnet",
      "message": "Could not parse CSV: invalid format"
    }
  ]
}
```

---

## Architecture

```
market_intelligence_agent/
├── app/
│   ├── __init__.py
│   ├── main.py                    # FastAPI app entry
│   ├── engines/
│   │   ├── __init__.py
│   │   ├── demand_engine.py       # Demand Strength analysis
│   │   ├── sales_momentum_engine.py
│   │   ├── revenue_momentum_engine.py
│   │   └── bsr_efficiency_engine.py
│   ├── routes/
│   │   ├── __init__.py
│   │   └── api.py                 # All API endpoints
│   ├── models/
│   │   ├── __init__.py
│   │   └── response_models.py     # Pydantic response schemas
│   ├── services/
│   │   ├── __init__.py
│   │   └── dataset_registry.py    # Global dataset storage
│   ├── validators/
│   │   ├── __init__.py
│   │   └── dataset_validator.py   # CSV validation
│   └── utils/
│       ├── __init__.py
│       ├── logger.py              # Logging utility
│       └── column_mapper.py       # Dynamic column detection
├── datasets/                       # Store uploaded CSVs (optional)
├── logs/                          # Automatic log files
├── requirements.txt
├── README.md
└── run.bat
```

---

## Column Detection

The system **automatically detects columns** using case-insensitive, whitespace-insensitive matching.

Example candidate lists:
```python
_SEARCH_VOL_CANDIDATES = ["Search Volume", "search volume", "SearchVolume"]
_BRAND_CANDIDATES = ["Brand", "brand", "Seller", "seller"]
_BSR_CANDIDATES = ["BSR", "bsr", "Best Sellers Rank"]
```

**Never invents columns** — only maps what exists in your datasets.

---

## Normalization & Safety

### Min-Max Normalization
All metrics use safe min-max normalization:
```python
normalized = (value - min) / (max - min) * 100
```

**Edge Cases Handled:**
- If `max == min` (all identical values) → returns 50.0 (neutral score)
- If all values are NaN → returns NaN
- Divide-by-zero protection built-in

### Percentile-Based Classification
No hardcoded thresholds. Instead:
```python
p75 = data.quantile(0.75)  # Top quartile
p25 = data.quantile(0.25)  # Bottom quartile
```

---

## Phase 1 Scope

This implementation includes:

✅ Demand Strength engine  
✅ Sales Momentum engine  
✅ Revenue Momentum engine  
✅ BSR Efficiency engine  
✅ Dataset upload & validation  
✅ Swagger UI  
✅ Error handling  
✅ Logging  
✅ Modular architecture  

### Future Phases
- Additional 14 analysis functions
- Report generation & narration
- PDF export capability
- Chart & visualization generation
- Frontend UI integration

---

## Usage Workflow

### Step 1: Start Server
```bash
uvicorn app.main:app --reload
```

### Step 2: Upload Datasets
```bash
# Via Swagger UI at http://localhost:8000/docs
# Or via curl:

curl -X POST http://localhost:8000/api/v1/upload-datasets \
  -F "blackbox=@blackbox_data.csv" \
  -F "magnet=@magnet_data.csv" \
  -F "keyword_classification=@keyword_classification.csv"
```

### Step 3: Run Analysis
```bash
# Via Swagger UI
# Or via curl:

curl -X POST http://localhost:8000/api/v1/demand-strength?top_n=10
curl -X POST http://localhost:8000/api/v1/sales-momentum
curl -X POST http://localhost:8000/api/v1/revenue-momentum
curl -X POST http://localhost:8000/api/v1/bsr-efficiency
```

### Step 4: Review Results
- All results include dataset traceability
- Check `columns_used` and `formula_used` fields
- Review validation status in `validation` object

---

## Performance Considerations

**Tested With:**
- Up to 50,000 rows per dataset
- 100+ columns per dataset

**Optimizations:**
- Vectorized Pandas operations (no row-by-row loops)
- Efficient groupby aggregations
- Memory-efficient numeric conversions
- No dataframe copies unless necessary

**Scaling:**
For larger datasets, consider:
- Chunk processing
- Caching computed results
- Database backend for historical data
- Async queue for long-running analyses

---

## Logging

All activity is logged to:
- **Console** (stdout with timestamps)
- **File** (`logs/market_intelligence_YYYYMMDD_HHMMSS.log`)

Log levels:
- `INFO` — Normal operation
- `WARNING` — Data quality issues, missing columns
- `ERROR` — Critical failures

---

## Requirements

See `requirements.txt`:
```
fastapi
uvicorn
pandas
numpy
python-multipart
pydantic
```

---

## Troubleshooting

**Q: "Datasets not uploaded" error**
A: Use POST `/api/v1/upload-datasets` first, then run analysis.

**Q: "Column not found" error**
A: Check your CSV column names. The system is case-insensitive but column must exist.
   View available columns: GET `/api/v1/status`

**Q: Import error when starting**
A: Make sure virtual environment is activated and requirements installed:
   ```bash
   pip install -r requirements.txt
   ```

**Q: Port 8000 already in use**
A: Either kill the process or use a different port:
   ```bash
   uvicorn app.main:app --port 8001 --reload
   ```

**Q: CSV parsing fails**
A: Try UTF-8 or UTF-8-sig encoding. Ensure valid CSV format.
   Check logs for specific parsing errors.

---

## Support & Documentation

- **API Docs:** http://localhost:8000/docs
- **OpenAPI Schema:** http://localhost:8000/openapi.json  
- **Health Check:** http://localhost:8000/api/v1/health
- **Logs:** `logs/` directory

---

## Version

**Market Intelligence Agent - Phase 1**
- Version: 1.0.0
- Release Date: May 2026
- Status: Production Ready

---

**Built with ❤️ by Profit Story**
