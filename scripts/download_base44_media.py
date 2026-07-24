"""Download inventoried Base44 files into private upload-ready directories."""

import hashlib
import json
import mimetypes
import re
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
from urllib.parse import unquote, urlparse

from inventory_base44_media import OUTPUT_FILE as INVENTORY_FILE


ROOT = INVENTORY_FILE.parent / "base44-media"
MANIFEST_FILE = ROOT / "manifest.json"


def safe_filename(url):
    name = unquote(Path(urlparse(url).path).name) or "file"
    name = re.sub(r"[^A-Za-z0-9._-]+", "-", name).strip(".-") or "file"
    return f"{hashlib.sha256(url.encode()).hexdigest()[:16]}_{name}"


def download(item):
    request = urllib.request.Request(
        item["url"], headers={"User-Agent": "hc-apparel-base44-migration/1.0"}
    )
    with urllib.request.urlopen(request, timeout=60) as response:
        content = response.read()
        content_type = response.headers.get_content_type()
    filename = safe_filename(item["url"])
    if "." not in Path(filename).name:
        extension = mimetypes.guess_extension(content_type) or ""
        filename += extension
    relative_path = Path(item["access"]) / "legacy" / filename
    output_path = ROOT / relative_path
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_bytes(content)
    return {
        **item,
        "local_path": relative_path.as_posix(),
        "object_path": f"legacy/{filename}",
        "bytes": len(content),
        "sha256": hashlib.sha256(content).hexdigest(),
        "content_type": content_type,
    }


def main():
    inventory = json.loads(INVENTORY_FILE.read_text(encoding="utf-8"))
    ROOT.mkdir(parents=True, exist_ok=True)
    downloaded = []
    errors = []
    with ThreadPoolExecutor(max_workers=8) as pool:
        futures = {pool.submit(download, item): item for item in inventory["files"]}
        for future in as_completed(futures):
            try:
                downloaded.append(future.result())
            except Exception as exc:
                errors.append({"url": futures[future]["url"], "error": str(exc)})
    payload = {
        "files": sorted(downloaded, key=lambda item: item["url"]),
        "errors": errors,
    }
    MANIFEST_FILE.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    print(
        f"Downloaded {len(downloaded)} of {inventory['unique_files']} unique files "
        f"({sum(item['bytes'] for item in downloaded)} bytes); errors={len(errors)}."
    )
    if errors:
        for error in errors:
            print(f"ERROR {error['url']}: {error['error']}")
        raise SystemExit(1)


if __name__ == "__main__":
    main()
