"""Download the two legacy static assets referenced directly by the frontend."""

import json

from download_base44_media import MANIFEST_FILE, download


OUTPUT_FILE = MANIFEST_FILE.parent / "static-assets.json"
ASSETS = {
    "logo": "https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/69889c36f99d1de4b17edfa4/4bf10d633_1.png",
    "home_banner": "https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/69889c36f99d1de4b17edfa4/bae687835_image_1.png",
}


def main():
    downloaded = {}
    for name, url in ASSETS.items():
        item = download({"url": url, "access": "public", "references": []})
        downloaded[name] = item
    OUTPUT_FILE.write_text(json.dumps(downloaded, indent=2), encoding="utf-8")
    for name, item in downloaded.items():
        print(f"{name}={item['object_path']}")


if __name__ == "__main__":
    main()
