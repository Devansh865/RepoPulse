import os
import re
import ast
import shutil
import hashlib
import stat
from typing import Dict, List, Set, Tuple
import git

# We place temporary repository clones inside the workspace under backend/temp_repos/
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TEMP_REPOS_DIR = os.path.join(BASE_DIR, "temp_repos")

# List of directory names to ignore during crawling
IGNORE_DIRS = {
    ".git", "node_modules", "venv", ".venv", "env", ".env",
    "__pycache__", "build", "dist", "out", ".next", ".cache",
    ".idea", ".vscode", "target", "bin", "obj"
}

# List of extensions to index
SUPPORTED_EXTENSIONS = {
    ".py", ".js", ".jsx", ".ts", ".tsx"
}

def remove_readonly(func, path, excinfo):
    """Error handler for shutil.rmtree to clear read-only flag on Windows."""
    try:
        os.chmod(path, stat.S_IWRITE)
        func(path)
    except Exception:
        pass

def safe_rmtree(path: str):
    """Safely removes a directory tree, resolving read-only files on Windows."""
    if os.path.exists(path):
        try:
            shutil.rmtree(path, onerror=remove_readonly)
        except Exception:
            try:
                shutil.rmtree(path, ignore_errors=True)
            except Exception:
                pass

def clean_old_clones():
    """Cleans up the temp repos folder to avoid running out of disk space."""
    safe_rmtree(TEMP_REPOS_DIR)
    os.makedirs(TEMP_REPOS_DIR, exist_ok=True)

def get_repo_temp_path(repo_url: str) -> str:
    """Generates a unique temporary directory name for the given repo URL."""
    hasher = hashlib.md5(repo_url.encode('utf-8'))
    folder_name = hasher.hexdigest()[:12]
    return os.path.join(TEMP_REPOS_DIR, folder_name)

def clone_repo(repo_url: str, dest_path: str) -> str:
    """Clones a GitHub repository to a local folder using shallow clone."""
    safe_rmtree(dest_path)
    os.makedirs(dest_path, exist_ok=True)
    
    # We do a shallow clone (depth=1) for speed
    git.Repo.clone_from(repo_url, dest_path, depth=1)
    
    # Return the repository name
    repo_name = repo_url.rstrip("/").split("/")[-1]
    if repo_name.endswith(".git"):
        repo_name = repo_name[:-4]
    return repo_name

def count_lines(file_path: str) -> int:
    """Counts lines of code in a file, fallback to 0 on encoding error."""
    try:
        with open(file_path, "r", encoding="utf-8", errors="ignore") as f:
            return sum(1 for _ in f)
    except Exception:
        return 0

# --- Python AST Import Parser ---
def extract_python_imports(file_content: str) -> List[Tuple[str, int]]:
    """Uses Python's ast parser to extract all imports.
    Returns a list of tuples: (imported_module_name, import_level)
    """
    imports = []
    try:
        tree = ast.parse(file_content)
        for node in ast.walk(tree):
            if isinstance(node, ast.Import):
                for alias in node.names:
                    imports.append((alias.name, 0))
            elif isinstance(node, ast.ImportFrom):
                if node.module:
                    imports.append((node.module, node.level))
                else:
                    # e.g., from . import foo
                    imports.append(("", node.level))
    except Exception:
        # Fallback to regex if file has syntax errors
        regex_imports = re.findall(r"^\s*(?:import|from)\s+([a-zA-Z0-9_\.]+)", file_content, re.MULTILINE)
        for imp in regex_imports:
            imports.append((imp, 0))
    return imports

def resolve_python_import(import_name: str, import_level: int, file_rel_path: str, all_py_files: Set[str]) -> List[str]:
    """Resolves a Python import to a list of candidate relative file paths in the repo."""
    resolved = []
    file_dir = os.path.dirname(file_rel_path)
    
    # Process relative imports (level > 0)
    if import_level > 0:
        # Each level goes up one directory
        parts = file_dir.split(os.sep) if file_dir else []
        for _ in range(import_level - 1):
            if parts:
                parts.pop()
        base_dir_path = os.path.join(*parts) if parts else ""
        
        # Resolve target
        target_subpath = import_name.replace(".", os.sep)
        cand_path = os.path.normpath(os.path.join(base_dir_path, target_subpath))
        
        # Test candidate file paths
        for ext in [".py", "/__init__.py"]:
            test_path = cand_path + ext if ext != "/__init__.py" else os.path.join(cand_path, "__init__.py")
            test_path = test_path.replace(os.sep, "/")
            if test_path in all_py_files:
                resolved.append(test_path)
                return resolved
                
    # Process absolute imports (level = 0)
    # E.g. import app.services.blast_radius_service
    # We check if there's a file matching:
    # 1. app/services/blast_radius_service.py
    # 2. services/blast_radius_service.py (if project roots are dynamic)
    # 3. blast_radius_service.py
    import_parts = import_name.split(".")
    for i in range(len(import_parts)):
        subpath = os.path.join(*import_parts[i:])
        for ext in [".py", "/__init__.py"]:
            cand = subpath + ext if ext != "/__init__.py" else os.path.join(subpath, "__init__.py")
            cand = cand.replace(os.sep, "/")
            
            # Match anywhere or matching exactly in list of py files
            for py_file in all_py_files:
                if py_file == cand or py_file.endswith("/" + cand):
                    resolved.append(py_file)
                    return resolved
                    
    return resolved

# --- JS/TS Regex Import Parser ---
def extract_jsts_imports(file_content: str) -> List[str]:
    """Extracts all relative and absolute imports from JS/TS files using regex."""
    imports = []
    
    # 1. import ... from 'source'
    from_pattern = r"\bimport\s+(?:[^'\"]*)\s+from\s+['\"]([^'\"]+)['\"]"
    # 2. import 'source'
    direct_pattern = r"\bimport\s+['\"]([^'\"]+)['\"]"
    # 3. require('source')
    require_pattern = r"\brequire\(\s*['\"]([^'\"]+)['\"]\s*\)"
    # 4. import('source') dynamic import
    dynamic_pattern = r"\bimport\(\s*['\"]([^'\"]+)['\"]\s*\)"
    
    for pattern in [from_pattern, direct_pattern, require_pattern, dynamic_pattern]:
        matches = re.findall(pattern, file_content)
        for m in matches:
            if m not in imports:
                imports.append(m)
                
    return imports

def resolve_jsts_import(import_path: str, file_rel_path: str, all_files: Set[str]) -> List[str]:
    """Resolves a JS/TS import path (relative or absolute alias) to a file in the repo."""
    resolved = []
    
    # We only resolve relative imports starting with ./ or ../
    if not (import_path.startswith("./") or import_path.startswith("../")):
        return resolved # skip absolute/node_modules imports
        
    file_dir = os.path.dirname(file_rel_path)
    cand_path = os.path.normpath(os.path.join(file_dir, import_path))
    cand_path = cand_path.replace(os.sep, "/")
    
    # Possible extensions to test
    extensions = [".ts", ".tsx", ".js", ".jsx", "/index.ts", "/index.tsx", "/index.js", "/index.jsx"]
    
    # If the import path already contains an extension (e.g. ./utils.js)
    _, ext = os.path.splitext(cand_path)
    if ext in SUPPORTED_EXTENSIONS:
        if cand_path in all_files:
            return [cand_path]
            
    for suffix in extensions:
        test_path = cand_path + suffix if not suffix.startswith("/") else os.path.normpath(cand_path + suffix)
        test_path = test_path.replace(os.sep, "/")
        if test_path in all_files:
            resolved.append(test_path)
            return resolved
            
    return resolved

def parse_repo_dependencies(repo_dir: str) -> Tuple[List[dict], List[dict]]:
    """Crawls through files in repo_dir, extracts imports, and maps dependencies.
    Returns (nodes, edges) lists.
    """
    all_files = set()
    file_details = {} # rel_path -> {type, size, loc}
    
    # Walk directory to index all supported files
    for root, dirs, files in os.walk(repo_dir):
        # In-place modify dirs to skip IGNORE_DIRS
        dirs[:] = [d for d in dirs if d not in IGNORE_DIRS]
        
        for file in files:
            _, ext = os.path.splitext(file)
            ext = ext.lower()
            if ext in SUPPORTED_EXTENSIONS:
                abs_path = os.path.join(root, file)
                rel_path = os.path.relpath(abs_path, repo_dir).replace(os.sep, "/")
                all_files.add(rel_path)
                
                file_details[rel_path] = {
                    "label": file,
                    "type": ext[1:], # remove dot
                    "size": os.path.getsize(abs_path),
                    "loc": count_lines(abs_path)
                }

    nodes = []
    edges = []
    edge_set = set() # To prevent duplicate edges
    
    # Build list of nodes
    for rel_path, details in file_details.items():
        nodes.append({
            "id": rel_path,
            "label": details["label"],
            "type": details["type"],
            "size": details["size"],
            "loc": details["loc"]
        })
        
    # Analyze dependencies for each file
    all_py_files = {f for f in all_files if f.endswith(".py")}
    
    for rel_path, details in file_details.items():
        abs_path = os.path.join(repo_dir, rel_path)
        
        try:
            with open(abs_path, "r", encoding="utf-8", errors="ignore") as f:
                content = f.read()
        except Exception:
            continue
            
        file_ext = "." + details["type"]
        resolved_deps = []
        
        if file_ext == ".py":
            # Python parsing
            imports = extract_python_imports(content)
            for imp_name, level in imports:
                resolved_deps.extend(resolve_python_import(imp_name, level, rel_path, all_py_files))
        else:
            # JS/TS parsing
            imports = extract_jsts_imports(content)
            for imp_path in imports:
                resolved_deps.extend(resolve_jsts_import(imp_path, rel_path, all_files))
                
        # Deduplicate resolved dependencies and build edges
        for dep in set(resolved_deps):
            if dep == rel_path:
                continue # ignore self-imports
            edge_id = f"{rel_path}->{dep}"
            if edge_id not in edge_set:
                edge_set.add(edge_id)
                edges.append({
                    "id": edge_id,
                    "source": rel_path,
                    "target": dep
                })
                
    return nodes, edges

def analyze_repo(repo_url: str) -> dict:
    """Clones a repo, parses its dependencies, and cleans up the files."""
    # Ensure root temp directory is set up
    os.makedirs(TEMP_REPOS_DIR, exist_ok=True)
    
    dest_path = get_repo_temp_path(repo_url)
    
    try:
        # 1. Clone
        repo_name = clone_repo(repo_url, dest_path)
        
        # 2. Parse dependencies
        nodes, edges = parse_repo_dependencies(dest_path)
        
        # 3. Clean up the directory to conserve space (optional, but let's keep it clean)
        # Actually, for Step 1, let's delete it right after parsing.
        # But wait! If we delete it, we won't be able to query files for future features (like "AI assistant details" or "simulated changes").
        # So we can keep it cached in temp_repos, but let's clear it if it exceeds a certain count, or clean older ones.
        # Let's keep it cached for now so the session has it, but write a clean-up routine if it grows.
        
        return {
            "status": "success",
            "repo_name": repo_name,
            "nodes": nodes,
            "edges": edges
        }
    except Exception as e:
        # Attempt clean up on failure
        if os.path.exists(dest_path):
            shutil.rmtree(dest_path, ignore_errors=True)
        return {
            "status": "error",
            "message": str(e)
        }
