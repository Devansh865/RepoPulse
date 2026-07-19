# run-dev.ps1
# Starts both Backend and Frontend for RepoPulse AI

Write-Host "=========================================" -ForegroundColor Cyan
Write-Host "    Starting RepoPulse AI Dev Servers    " -ForegroundColor Cyan
Write-Host "=========================================" -ForegroundColor Cyan

# 1. Start backend in a new window
Write-Host "[1/2] Launching FastAPI Backend on http://localhost:8000..." -ForegroundColor Green
Start-Process -FilePath "powershell" -ArgumentList "-NoExit", "-Command", "Write-Host 'Starting FastAPI backend...'; cd backend; .\.venv\Scripts\python.exe main.py" -WindowStyle Normal

# 2. Start frontend in a new window
Write-Host "[2/2] Launching React Frontend on http://localhost:5173..." -ForegroundColor Green
Start-Process -FilePath "powershell" -ArgumentList "-NoExit", "-Command", "Write-Host 'Starting Vite React dev server...'; cd frontend; npm run dev" -WindowStyle Normal

Write-Host ""
Write-Host "Both servers are starting in separate terminal windows." -ForegroundColor Cyan
Write-Host "- Backend: http://localhost:8000" -ForegroundColor Gray
Write-Host "- Frontend: http://localhost:5173 (or as specified by Vite)" -ForegroundColor Gray
Write-Host ""
Write-Host "Press Enter to exit this manager script." -ForegroundColor Yellow
Read-Host
