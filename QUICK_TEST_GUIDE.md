# Quick Test Guide - Validation Steps

## Prerequisites

### Start Backend
```bash
cd c:\Users\annie\agent1
python -m uvicorn app.main:app --reload
```
**Expected output:**
```
INFO:     Uvicorn running on http://127.0.0.1:8000
INFO:     Application startup complete.
```

### Start Frontend
```bash
cd c:\Users\annie\agent1\market_intelligence_dashboard
npm run dev
```
**Expected output:**
```
  VITE v8.x.x  ready in xxx ms
  ➜  Local:   http://localhost:5173/
```

---

## Test 1: Filter Crashes Fixed ⚡ 2 minutes

### Steps
1. Open http://localhost:5173
2. Upload datasets (if not already uploaded)
3. Navigate to each page:
   - Click "Whitespace Opportunities"
   - Click "Demand Intelligence"
   - Click "Market Structure" → "Market Concentration"
   - Click "Inbound Efficiency"

### Success Criteria ✅
- [ ] No blank white pages
- [ ] No console errors mentioning "Cannot read properties of undefined"
- [ ] No console errors mentioning "Rendered more hooks"
- [ ] All pages load data tables and charts
- [ ] Filter buttons work without crashes

### Failure Signs ❌
- Blank white page
- Console: `Cannot read properties of undefined (reading 'data')`
- Console: `Rendered more hooks than during previous render`

---

## Test 2: Backend Not Running Error ⚡ 1 minute

### Steps
1. **Stop backend** (Ctrl+C in backend terminal)
2. Open http://localhost:5173/upload
3. Upload any CSV files
4. Click "Start Analysis"

### Success Criteria ✅
- [ ] Error modal appears
- [ ] Title: "Backend Connection Failed"
- [ ] Reason: "Frontend could not connect to the API server. This is not a CSV issue."
- [ ] Action includes: "Ensure backend is running"
- [ ] **Does NOT mention CSV schemas or column issues**

### Failure Signs ❌
- Error blames CSV format
- Error says "Verify your CSV schemas"
- No mention of backend connectivity

---

## Test 3: Valid Upload With Categories ⚡ 2 minutes

### Steps
1. **Start backend** (if stopped)
2. Open http://localhost:5173/upload
3. Upload BlackBox CSV with multiple categories
4. Upload Magnet CSV
5. Click "Start Analysis"

### Success Criteria ✅
- [ ] Upload succeeds
- [ ] Category selection modal appears
- [ ] Modal shows detected categories with:
  - [ ] Product counts
  - [ ] Revenue or units
  - [ ] Sample products
- [ ] Can select/deselect categories
- [ ] "Start Analysis" button enables when category selected
- [ ] Analysis starts successfully after category selection

### Failure Signs ❌
- No category modal appears
- Modal shows error
- Cannot select categories
- Analysis fails after category selection

---

## Test 4: CSV Schema Error ⚡ 2 minutes

### Steps
1. Create a CSV with wrong headers:
   ```csv
   Product,Price,Sales
   Item1,10,100
   Item2,20,200
   ```
2. Save as `test_wrong_schema.csv`
3. Open http://localhost:5173/upload
4. Upload this CSV as BlackBox
5. Click "Start Analysis"

### Success Criteria ✅
- [ ] Error modal appears
- [ ] Title: "CSV Schema Validation Failed"
- [ ] Shows missing columns (e.g., "Parent Level Revenue", "BSR")
- [ ] Shows detected columns (e.g., "Product, Price, Sales")
- [ ] **Does NOT mention CORS or connectivity**
- [ ] Action says "Review the missing columns"

### Failure Signs ❌
- Error mentions CORS or backend
- Error says "Backend connection failed"
- Missing columns not listed
- Generic "validation failed" with no details

---

## Test 5: Health Check (Optional) ⚡ 3 minutes

### Steps
1. **Start backend**
2. Add console logging to see health check:
   ```typescript
   // In browser console before upload:
   fetch('http://localhost:8000/api/v1/health')
     .then(r => r.json())
     .then(d => console.log('Health:', d))
   ```
3. Open http://localhost:5173/upload
4. Upload datasets
5. Watch browser console during upload

### Success Criteria ✅
- [ ] Health check succeeds before category detection
- [ ] Console shows health check request
- [ ] No errors during health check
- [ ] Category detection proceeds after health check

---

## Quick Console Commands

### Check Backend is Running
```bash
curl http://localhost:8000/api/v1/health
```
**Expected:**
```json
{
  "success": true,
  "message": "Market Intelligence Agent is running",
  "data": { ... }
}
```

### Check CORS Configuration
```bash
curl -H "Origin: http://localhost:5173" -I http://localhost:8000/api/v1/health
```
**Expected headers include:**
```
Access-Control-Allow-Origin: http://localhost:5173
Access-Control-Allow-Credentials: true
```

### Check Frontend Build
```bash
cd c:\Users\annie\agent1\market_intelligence_dashboard
npm run build
```
**Expected:**
```
✓ built in ~1000ms
[No errors]
```

---

## Common Issues & Quick Fixes

### Issue: "CORS error" despite correct config
**Fix:** 
1. Clear browser cache (Ctrl+Shift+Del)
2. Hard refresh (Ctrl+Shift+R)
3. Restart both frontend and backend

### Issue: Pages still crash with undefined data
**Fix:**
1. Verify build: `npm run build`
2. Clear node_modules/.cache
3. Restart dev server: `npm run dev`

### Issue: Category detection always fails
**Fix:**
1. Check backend logs for errors
2. Verify BlackBox CSV has a category column
3. Test `/detect-categories` directly:
   ```bash
   curl http://localhost:8000/api/v1/detect-categories
   ```

### Issue: Generic "validation failed" errors
**Fix:**
1. Check browser console for full error details
2. Check backend terminal for stack traces
3. Verify error response structure in Network tab

---

## Expected Test Results Summary

| Test | Expected Time | Pass Criteria |
|------|---------------|---------------|
| Filter Crashes | 2 min | All pages load, no console errors |
| Backend Not Running | 1 min | "Backend connection failed" message, doesn't blame CSV |
| Valid Upload | 2 min | Category modal appears with selection options |
| Schema Error | 2 min | Shows missing columns, doesn't mention connectivity |
| Health Check | 3 min | Health check succeeds before category detection |

**Total Testing Time: ~10 minutes**

---

## After Testing

### If All Tests Pass ✅
- Mark tasks complete in project tracking
- Deploy to staging/production
- Update team documentation

### If Tests Fail ❌
1. Note which specific test failed
2. Check browser console for errors
3. Check backend logs for stack traces
4. Compare error message to expected message
5. Report findings with:
   - Which test failed
   - Actual error message vs expected
   - Browser console output
   - Backend log output

---

## One-Command Test Script (Optional)

Create `test_upload.py` for automated backend testing:

```python
import requests

BASE = "http://localhost:8000/api/v1"

# Test 1: Health check
try:
    r = requests.get(f"{BASE}/health")
    print(f"✅ Health: {r.status_code}")
except:
    print("❌ Health check failed - backend not running")

# Test 2: Detect categories (should fail if no data)
try:
    r = requests.get(f"{BASE}/detect-categories")
    print(f"✅ Categories endpoint: {r.status_code}")
    print(f"   Response: {r.json()}")
except Exception as e:
    print(f"❌ Categories failed: {e}")
```

Run: `python test_upload.py`

---

## Contact / Support

If issues persist:
1. Check `SESSION_COMPLETE_SUMMARY.md` for detailed fixes
2. Check `CATEGORY_DETECTION_FIX_COMPLETE.md` for backend details
3. Check `FILTER_AND_CORS_FIX_COMPLETE.md` for frontend details
4. Review browser DevTools → Network tab for API calls
5. Review backend terminal for error logs

**All documentation files created:**
- `SESSION_COMPLETE_SUMMARY.md`
- `CATEGORY_DETECTION_FIX_COMPLETE.md`
- `FILTER_AND_CORS_FIX_COMPLETE.md`
- `QUICK_TEST_GUIDE.md` (this file)
