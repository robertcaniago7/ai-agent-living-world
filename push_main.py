"""Push AI Agent Living World source to GitHub repo robertcaniago7/ai-agent-living-world
as a new `main` branch (root commit, no parents). The repo currently only has
a gh-pages branch with the built frontend; source was never committed.

Token is read from stdin (first line) and never stored or printed.
Usage: python3 push_main.py < token.txt  (token via stdin only)
"""
import sys, os, json, base64, urllib.request

BASE = "/home/hatch/workspace/ai-agent-living-world"
OWNER = "robertcaniago7"
REPO = "ai-agent-living-world"

EXCLUDE_DIRS = {"node_modules", "dist", ".git", "__pycache__", "data"}
EXCLUDE_FILES = {".write-lock"}

def gh(method, path, token, body=None):
    url = "https://api.github.com" + path
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, method=method)
    req.add_header("Authorization", "Bearer " + token)
    req.add_header("Accept", "application/vnd.github+json")
    req.add_header("Content-Type", "application/json")
    with urllib.request.urlopen(req, timeout=60) as resp:
        return json.load(resp)

token = sys.stdin.readline().strip()
if not token.startswith("ghp_"):
    print("ERROR: stdin did not start with a GitHub PAT", flush=True)
    sys.exit(1)

# 1. collect files
files = []
for root, dirs, names in os.walk(BASE):
    dirs[:] = sorted(d for d in dirs if d not in EXCLUDE_DIRS)
    for n in sorted(names):
        if n in EXCLUDE_FILES:
            continue
        p = os.path.join(root, n)
        rel = os.path.relpath(p, BASE)
        files.append(rel)
print(f"files to push: {len(files)}", flush=True)

# 2. upload blobs
entries = []
for rel in files:
    with open(os.path.join(BASE, rel), "rb") as f:
        raw = f.read()
    try:
        text = raw.decode("utf-8")
        blob = gh("POST", f"/repos/{OWNER}/{REPO}/git/blobs", token,
                  {"content": text, "encoding": "utf-8"})
    except UnicodeDecodeError:
        blob = gh("POST", f"/repos/{OWNER}/{REPO}/git/blobs", token,
                  {"content": base64.b64encode(raw).decode(), "encoding": "base64"})
    entries.append({"path": rel, "mode": "100644", "type": "blob", "sha": blob["sha"]})
    print(rel, "->", blob["sha"][:12], flush=True)

# 3. create root tree (no base_tree)
tree = gh("POST", f"/repos/{OWNER}/{REPO}/git/trees", token, {"tree": entries})
print("new tree:", tree["sha"], flush=True)

# 4. create root commit (no parents)
commit = gh("POST", f"/repos/{OWNER}/{REPO}/git/commits", token, {
    "message": "Initial source: AI Agent Living World (Fase 1-7 + Misi Uang, Gemini 3.1 Pro model patch)",
    "tree": tree["sha"],
    "parents": [],
})
print("new commit:", commit["sha"], flush=True)

# 5. create main branch ref
ref = gh("POST", f"/repos/{OWNER}/{REPO}/git/refs", token, {
    "ref": "refs/heads/main",
    "sha": commit["sha"],
})
print("main ref:", ref["ref"], "->", ref["object"]["sha"], flush=True)
print("DONE", commit["sha"], flush=True)
