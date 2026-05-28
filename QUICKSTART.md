# QUICK START GUIDE
# Market Intelligence Agent - Phase 1

## ⚡ 5-Minute Quick Start

### Step 1: Install Requirements
```bash
cd D:\profitstory\market_intelligence_agent
pip install -r requirements.txt
```

### Step 2: Start the Server
**Option A - Windows users:**
```
Double-click: run.bat
```

**Option B - Command line:**
```bash
uvicorn app.main:app --reload
```

### Step 3: Open Swagger UI
Visit: **http://localhost:8000/docs**

### Step 4: Upload Datasets
1. Click "Try it out" on `/api/v1/upload-datasets`
2. Select your CSV files (blackbox, magnet, keyword_classification)
3. Click "Execute"
4. You'll see: `"status": "success"`

### Step 5: Run Analysis
1. Click on any analysis endpoint:
   - `/api/v1/demand-strength`
   - `/api/v1/sales-momentum`
   - `/api/v1/revenue-momentum`
   - `/api/v1/bsr-efficiency`
2. Click "Try it out" → "Execute"
3. View complete analysis results with formulas and column traceability

---

## 📊 What Each Engine Does

| Engine | Input | Output |
|--------|-------|--------|
| **Demand Strength** | Magnet + BlackBox | Market demand score (0-100) |
| **Sales Momentum** | BlackBox | Brand sales growth ranking |
| **Revenue Momentum** | BlackBox | Brand revenue growth ranking |
| **BSR Efficiency** | BlackBox | Revenue vs. BSR efficiency scores |

---

## 🧪 Test with Sample Data

Sample datasets are in `datasets/` folder:
- `BlackBox_Products_Bamboo Towel.csv`
- `Magnet_Bamboo Towel.csv`
- `keyword_classification_bamboo_towel.csv`

Upload these to test all engines!

---

## 🔗 Key URLs

- **Swagger UI (Testing)**: http://localhost:8000/docs
- **API Root**: http://localhost:8000/
- **Health Check**: http://localhost:8000/api/v1/health
- **Dataset Status**: http://localhost:8000/api/v1/status

---

## 💡 Key Features

✅ **Deterministic** — Same data = Same results  
✅ **No Hallucinations** — Every metric from dataset  
✅ **Traceable** — See formulas & columns used  
✅ **Safe** — Handles all edge cases  
✅ **Fast** — Vectorized Pandas operations  

---

## ❓ Troubleshooting

**"Datasets not uploaded"**
→ Use `/api/v1/upload-datasets` first

**"Column not found"**
→ Check your CSV column names, system is case-insensitive

**"Port already in use"**
→ Use different port: `uvicorn app.main:app --port 8001`

**Detailed logs**
→ Check `logs/` folder for debug information

---

## 📖 Full Documentation

See **README.md** for:
- Complete API documentation
- Column detection guide
- Formula explanations
- Performance tuning
- Architecture details

---

## 🚀 Production Deployment

For production use:
```bash
uvicorn app.main:app --host 0.0.0.0 --port 8000 --workers 4
```

---

**Ready to analyze? Start the server and head to Swagger UI!**
