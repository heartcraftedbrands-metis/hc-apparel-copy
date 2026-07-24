"""Prepare private, import-ready CSVs from a Base44 dashboard export ZIP."""

import csv
import json
import sys
import zipfile
from pathlib import Path

from generate_supabase_migration import ENTITY_DIR, TABLE_NAMES, read_jsonc


ROOT = Path(__file__).resolve().parents[1]
PRIVATE_DIR = ROOT / "supabase" / ".private" / "base44-import"
MANIFEST_FILE = ROOT / "supabase" / "base44-import-manifest.json"

SYSTEM_RENAMES = {
    "created_by_id": "legacy_created_by_id",
    "created_by": "created_by_email",
}


def main(zip_path):
    zip_path = Path(zip_path).resolve()
    PRIVATE_DIR.mkdir(parents=True, exist_ok=True)

    schemas = {}
    for path in ENTITY_DIR.glob("*.jsonc"):
        entity = read_jsonc(path)
        schemas[entity["name"]] = entity

    manifest = {
        "source_zip": zip_path.name,
        "generated_at": "2026-07-22",
        "contains_pii": True,
        "committed_to_git": False,
        "tables": [],
        "excluded_from_initial_import": [
            "ss_import_staging",
            "import_batches",
        ],
        "notes": [
            "Base44 auth users cannot be exported; owner_user_id remains null until account reconciliation.",
            "legacy_created_by_id and created_by_email preserve source ownership metadata.",
            "SS import staging and import batch history are retained locally but excluded from the initial production import.",
        ],
    }

    with zipfile.ZipFile(zip_path) as archive:
        names = set(archive.namelist())
        for entity_name, table_name in TABLE_NAMES.items():
            source_name = f"{entity_name}_export.csv"
            schema = schemas[entity_name]
            property_names = list((schema.get("properties") or {}).keys())
            output_headers = [
                "id",
                "created_date",
                "updated_date",
                "legacy_created_by_id",
                "created_by_email",
                "owner_user_id",
                "is_sample",
                *property_names,
            ]
            if table_name == "vendor_orders":
                output_headers.append("customer_paid_total")

            output_path = PRIVATE_DIR / f"{table_name}.csv"
            row_count = 0
            if source_name not in names or archive.getinfo(source_name).file_size == 0:
                output_path.write_text("", encoding="utf-8")
                manifest["tables"].append({
                    "entity": entity_name,
                    "table": table_name,
                    "rows": 0,
                    "state": "empty",
                })
                continue

            with archive.open(source_name) as raw, output_path.open("w", encoding="utf-8", newline="") as target:
                text = (line.decode("utf-8-sig") for line in raw)
                reader = csv.DictReader(text)
                writer = csv.DictWriter(target, fieldnames=output_headers, extrasaction="ignore")
                writer.writeheader()
                for source in reader:
                    row = {header: "" for header in output_headers}
                    for key, value in source.items():
                        target_key = SYSTEM_RENAMES.get(key, key)
                        if target_key in row:
                            row[target_key] = value
                    row["owner_user_id"] = ""
                    writer.writerow(row)
                    row_count += 1

            manifest["tables"].append({
                "entity": entity_name,
                "table": table_name,
                "rows": row_count,
                "state": "prepared",
            })

    MANIFEST_FILE.parent.mkdir(parents=True, exist_ok=True)
    MANIFEST_FILE.write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    print(json.dumps(manifest, indent=2))


if __name__ == "__main__":
    if len(sys.argv) != 2:
        raise SystemExit("Usage: prepare_base44_import.py <base44-export.zip>")
    main(sys.argv[1])
