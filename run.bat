@echo off
REM Market Intelligence Agent - Phase 1
REM FastAPI startup script for Windows
REM
REM Usage: Double-click this file or run from command line
REM The API will start at http://localhost:8000
REM Swagger UI available at http://localhost:8000/docs

echo.
echo ========================================
echo Market Intelligence Agent - Phase 1
echo ========================================
echo.
echo Starting FastAPI server...
echo.
echo Swagger UI will be available at:
echo   http://localhost:8000/docs
echo.
echo OpenAPI Schema at:
echo   http://localhost:8000/openapi.json
echo.
echo Press Ctrl+C to stop the server
echo.
echo ========================================
echo.

REM Activate virtual environment if it exists
if exist venv\Scripts\activate.bat (
    echo Activating virtual environment...
    call venv\Scripts\activate.bat
    echo.
)

REM Run FastAPI with uvicorn
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

echo.
echo Server stopped.
pause
