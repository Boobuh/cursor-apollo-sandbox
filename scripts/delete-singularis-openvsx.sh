#!/usr/bin/env bash
# Delete an extension from Open VSX using your logged-in Chrome session.
# Usage: ./scripts/delete-singularis-openvsx.sh [Namespace] [extension-name]
# Requires: Chrome signed in to open-vsx.org, python3, browser-cookie3, requests.
set -euo pipefail

NAMESPACE="${1:-Singularis}"
EXTENSION="${2:-singularis}"

python3 - "$NAMESPACE" "$EXTENSION" <<'PY'
import sys

try:
    import browser_cookie3
    import requests
except ImportError:
    print("Install deps: pip install browser-cookie3 requests", file=sys.stderr)
    sys.exit(1)

namespace, extension = sys.argv[1], sys.argv[2]
session = requests.Session()
session.cookies = browser_cookie3.chrome(domain_name="open-vsx.org")

csrf = session.get("https://open-vsx.org/user/csrf", timeout=30).json()
header = csrf.get("header", "X-CSRF-TOKEN")
value = csrf["value"]

meta = session.get(
    f"https://open-vsx.org/user/extension/{namespace}/{extension}", timeout=30
)
if meta.status_code == 404:
    print(f"Already gone: {namespace}.{extension}")
    sys.exit(0)
meta.raise_for_status()

versions = meta.json().get("versions") or []
if not versions:
    print(f"No versions found for {namespace}.{extension}")
    sys.exit(1)

body = [
    {"version": v["version"], "targetPlatform": tp}
    for v in versions
    for tp in v.get("targetPlatforms", ["universal"])
]

resp = session.post(
    f"https://open-vsx.org/user/extension/{namespace}/{extension}/delete",
    json=body,
    headers={"Content-Type": "application/json", header: value},
    timeout=30,
)
resp.raise_for_status()
data = resp.json()
if not data.get("success"):
    print("Delete failed:", data, file=sys.stderr)
    sys.exit(1)
print(f"Deleted {namespace}.{extension}")
PY
