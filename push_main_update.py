"""Push AI Agent Living World source updates to GitHub repo
robertcaniago7/ai-agent-living-world, on top of the current main HEAD
(new commit, parent = remote HEAD, no force).

Auth: GitHub PAT from the registered custom.github connection, applied
as a Bearer surrogate via dynamic_credentials.py. The real token is
never read, printed, or stored here.

Usage: python3 push_main_update.py
"""
import sys
import os
import json
import base64
import urllib.request
import urllib.error

sys.path.insert(0, "/opt/muse/skills/custom-connector-setup/bin")
from dynamic_credentials import add_surrogate_to_request, read_json_response

BASE = "/home/hatch/workspace/ai-agent-living-world"
OWNER = "robertcaniago7"
REPO = "ai-agent-living-world"
HOSTS = ["api.github.com"]

EXCLUDE_DIRS = {"node_modules", "dist", ".git", "__pycache__", "data"}
EXCLUDE_FILES = {".write-lock"}


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args):
        raise RuntimeError("redirect refused, verify the endpoint")


def gh(method, path, body=None):
    url = "https://api.github.com" + path
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, method=method)
    req.add_header("Accept", "application/vnd.github+json")
    req.add_header("Content-Type", "application/json")
    add_surrogate_to_request(req, "custom.github", allowed_hosts=HOSTS)
    try:
        with urllib.request.build_opener(NoRedirect()).open(
            req, timeout=60
        ) as resp:
            return read_json_response(resp)
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")
        raise SystemExit(f"GitHub HTTP {exc.code}: {detail[:2000]}")


def main():
    # 1. current main ref
    ref = gh("GET", f"/repos/{OWNER}/{REPO}/git/refs/heads/main")
    head_sha = ref["object"]["sha"]
    print("remote HEAD:", head_sha, flush=True)

    # 2. base tree
    commit = gh("GET", f"/repos/{OWNER}/{REPO}/git/commits/{head_sha}")
    tree_sha = commit["tree"]["sha"]
    print("base tree:", tree_sha, flush=True)

    # 3. collect + upload files as blobs
    files = []
    for root, dirs, names in os.walk(BASE):
        dirs[:] = sorted(d for d in dirs if d not in EXCLUDE_DIRS)
        for n in sorted(names):
            if n in EXCLUDE_FILES:
                continue
            files.append(os.path.relpath(os.path.join(root, n), BASE))
    print(f"files to push: {len(files)}", flush=True)

    entries = []
    for rel in files:
        with open(os.path.join(BASE, rel), "rb") as f:
            raw = f.read()
        try:
            text = raw.decode("utf-8")
            blob = gh("POST", f"/repos/{OWNER}/{REPO}/git/blobs",
                      {"content": text, "encoding": "utf-8"})
        except UnicodeDecodeError:
            blob = gh("POST", f"/repos/{OWNER}/{REPO}/git/blobs",
                      {"content": base64.b64encode(raw).decode(),
                       "encoding": "base64"})
        entries.append({"path": rel, "mode": "100644",
                        "type": "blob", "sha": blob["sha"]})
        print(rel, "->", blob["sha"][:12], flush=True)

    # 4. create tree on top of base tree
    tree = gh("POST", f"/repos/{OWNER}/{REPO}/git/trees",
              {"base_tree": tree_sha, "tree": entries})
    print("new tree:", tree["sha"], flush=True)

    # 5. create commit (parent = current HEAD)
    new_commit = gh("POST", f"/repos/{OWNER}/{REPO}/git/commits", {
        "message": "Living World: add root Dockerfile + .dockerignore for Back4App Containers deploy (free tier, no card)",
        "tree": tree["sha"],
        "parents": [head_sha],
    })
    print("new commit:", new_commit["sha"], flush=True)

    # 6. move main ref (no force)
    upd = gh("PATCH", f"/repos/{OWNER}/{REPO}/git/refs/heads/main",
             {"sha": new_commit["sha"], "force": False})
    print("main ref:", upd["ref"], "->", upd["object"]["sha"], flush=True)
    print("DONE", new_commit["sha"], flush=True)


if __name__ == "__main__":
    main()
