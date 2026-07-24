"""Inventory Base44-hosted files and classify their Supabase Storage access."""

import csv
import json
import re
from collections import Counter

from prepare_base44_import import PRIVATE_DIR


URL_PATTERN = re.compile(r"https?://[^\s\"'<>]+")
MEDIA_HOSTS = {"media.base44.com", "base44.app"}
PUBLIC_FIELDS = {
    ("products", "image_url"),
    ("products", "mockup_images"),
    ("garment_catalog_items", "image_url"),
    ("ss_catalog_items", "image_url"),
}
OUTPUT_FILE = PRIVATE_DIR.parent / "base44-media-inventory.json"


def clean_url(value):
    return value.rstrip(",.;:)]}")


def main():
    occurrences = []
    for csv_path in sorted(PRIVATE_DIR.glob("*.csv")):
        if csv_path.stat().st_size == 0:
            continue
        table = csv_path.stem
        with csv_path.open(encoding="utf-8", newline="") as handle:
            for row in csv.DictReader(handle):
                for field, value in row.items():
                    if not value:
                        continue
                    for raw_url in URL_PATTERN.findall(value):
                        url = clean_url(raw_url)
                        if not any(host in url for host in MEDIA_HOSTS):
                            continue
                        occurrences.append(
                            {
                                "table": table,
                                "id": row["id"],
                                "field": field,
                                "url": url,
                                "access": "public" if (table, field) in PUBLIC_FIELDS else "private",
                            }
                        )

    unique = {}
    for item in occurrences:
        current = unique.setdefault(
            item["url"],
            {"url": item["url"], "access": item["access"], "references": []},
        )
        if item["access"] == "private":
            current["access"] = "private"
        current["references"].append(
            {"table": item["table"], "id": item["id"], "field": item["field"]}
        )

    payload = {
        "unique_files": len(unique),
        "occurrences": len(occurrences),
        "by_access": dict(Counter(item["access"] for item in unique.values())),
        "by_table_field": dict(
            sorted(Counter(f"{item['table']}.{item['field']}" for item in occurrences).items())
        ),
        "files": list(unique.values()),
    }
    OUTPUT_FILE.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    print(json.dumps({key: payload[key] for key in payload if key != "files"}, indent=2))


if __name__ == "__main__":
    main()
