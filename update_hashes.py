"""Compute SHA-256 hashes of v2/js/*.js and write them into the v2 index JSON files.

Hashes are taken over LF-normalized content, because git (core.autocrlf) stores
and the CDNs serve LF files even when the local checkout has CRLF.
"""

import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent
V2_DIR = ROOT / "v2"
JS_DIR = V2_DIR / "js"


def hash_js_files():
    hashes = {}
    for path in sorted(JS_DIR.glob("*.js")):
        content = path.read_bytes().replace(b"\r\n", b"\n")
        hashes[path.name] = hashlib.sha256(content).hexdigest()
    return hashes


def update_index(path, hashes, referenced):
    with path.open("r", encoding="utf-8", newline="") as f:
        original = f.read()
    newline = "\r\n" if "\r\n" in original else "\n"
    data = json.loads(original)

    changed = 0
    for entry in data.get("extensions", []):
        file_name = entry.get("extensionUrl", "").rsplit("/", 1)[-1]
        referenced.add(file_name)
        if file_name not in hashes:
            print(f"  WARNING: {entry.get('name')}: {file_name} not found in {JS_DIR.relative_to(ROOT)}")
            continue
        if entry.get("hash") != hashes[file_name]:
            entry["hash"] = hashes[file_name]
            changed += 1

    output = json.dumps(data, indent=4, ensure_ascii=False).replace("\n", newline)
    if original.endswith(newline):
        output += newline
    if output != original:
        with path.open("w", encoding="utf-8", newline="") as f:
            f.write(output)
    return changed


def main():
    hashes = hash_js_files()
    referenced = set()

    for path in sorted(V2_DIR.glob("*.json")):
        print(f"{path.relative_to(ROOT)}:")
        changed = update_index(path, hashes, referenced)
        print(f"  {changed} hash(es) updated")

    for file_name in sorted(set(hashes) - referenced):
        print(f"WARNING: {file_name} is not referenced by any index file")


if __name__ == "__main__":
    main()
