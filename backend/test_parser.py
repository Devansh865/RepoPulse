# test_parser.py
from app.parser import analyze_repo
import json

print("Starting parser integration test...")
repo_url = "https://github.com/pallets/click"
result = analyze_repo(repo_url)

print("Status:", result.get("status"))
if result.get("status") == "success":
    print("Repository Name:", result.get("repo_name"))
    print("Number of Nodes (files):", len(result.get("nodes", [])))
    print("Number of Edges (imports):", len(result.get("edges", [])))
    print("\nFirst 3 nodes:")
    for n in result.get("nodes", [])[:3]:
        print(" -", n)
    print("\nFirst 3 edges:")
    for e in result.get("edges", [])[:3]:
        print(" -", e)
else:
    print("Error message:", result.get("message"))
