import uvicorn
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, HttpUrl
import os

# Import parser
from app.parser import analyze_repo, clean_old_clones

app = FastAPI(title="RepoPulse AI API", version="1.0.0")

# Enable CORS for frontend requests
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], # In development we allow all, or specifically localhost:5173
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class AnalyzeRequest(BaseModel):
    repo_url: str

@app.get("/api/health")
def health_check():
    return {"status": "ok", "message": "RepoPulse AI Backend is running."}

@app.post("/api/analyze")
def analyze_repository(request: AnalyzeRequest):
    url = str(request.repo_url).strip()
    if not url.startswith("http://") and not url.startswith("https://"):
        raise HTTPException(status_code=400, detail="Invalid URL scheme. Must be HTTP or HTTPS.")
        
    if "github.com" not in url:
        raise HTTPException(status_code=400, detail="Currently, only GitHub repositories are supported.")

    # Clean old clones occasionally (e.g. before parsing a new one to keep disk footprint low)
    # For now, we clean older clones.
    # To keep it simple, we do it in a try/except so it doesn't break cloning
    try:
        # Check size of temp_repos; if too many folders, clear them
        temp_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "temp_repos")
        if os.path.exists(temp_dir):
            folders = [os.path.join(temp_dir, d) for d in os.listdir(temp_dir) if os.path.isdir(os.path.join(temp_dir, d))]
            if len(folders) >= 5: # Limit cached repos to 5
                clean_old_clones()
    except Exception:
        pass

    result = analyze_repo(url)
    if result.get("status") == "error":
        raise HTTPException(status_code=500, detail=result.get("message"))
        
    return result

if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
