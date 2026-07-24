"""Validate prepared Base44 CSVs before importing them into Supabase."""

import csv
import json
from datetime import date, datetime
from pathlib import Path

from generate_supabase_migration import ENTITY_DIR, LEGACY_ENUM_VALUES, TABLE_NAMES, read_jsonc
from prepare_base44_import import MANIFEST_FILE, PRIVATE_DIR


SYSTEM_HEADERS = [
    "id",
    "created_date",
    "updated_date",
    "legacy_created_by_id",
    "created_by_email",
    "owner_user_id",
    "is_sample",
]


def validate_value(table, row_number, field, value, spec, errors):
    if value == "":
        return
    kind = spec.get("type")
    try:
        if kind == "number":
            float(value)
        elif kind == "integer":
            int(value)
        elif kind == "boolean" and value.lower() not in {"true", "false"}:
            raise ValueError("expected true or false")
        elif kind in {"array", "object"}:
            parsed = json.loads(value)
            expected = list if kind == "array" else dict
            if not isinstance(parsed, expected):
                raise ValueError(f"expected JSON {kind}")
        elif kind == "string" and spec.get("format") == "date-time":
            datetime.fromisoformat(value.replace("Z", "+00:00"))
        elif kind == "string" and spec.get("format") == "date":
            date.fromisoformat(value)
    except (TypeError, ValueError, json.JSONDecodeError) as exc:
        errors.append(f"{table} row {row_number} field {field}: {exc}")
    allowed = {
        str(item)
        for item in [*(spec.get("enum") or []), *LEGACY_ENUM_VALUES.get((table, field), [])]
    }
    if allowed and value not in allowed:
        errors.append(f"{table} row {row_number} field {field}: invalid enum {value!r}")


def main():
    manifest = json.loads(MANIFEST_FILE.read_text(encoding="utf-8"))
    manifest_counts = {item["table"]: item["rows"] for item in manifest["tables"]}
    errors = []
    total_rows = 0

    for schema_path in sorted(ENTITY_DIR.glob("*.jsonc")):
        schema = read_jsonc(schema_path)
        table = TABLE_NAMES[schema["name"]]
        properties = schema.get("properties") or {}
        expected_headers = SYSTEM_HEADERS + list(properties)
        if table == "vendor_orders":
            expected_headers.append("customer_paid_total")
        csv_path = PRIVATE_DIR / f"{table}.csv"
        expected_count = manifest_counts[table]

        if expected_count == 0:
            if csv_path.read_text(encoding="utf-8") != "":
                errors.append(f"{table}: expected an empty file")
            continue

        with csv_path.open(encoding="utf-8", newline="") as handle:
            reader = csv.DictReader(handle)
            if reader.fieldnames != expected_headers:
                errors.append(f"{table}: CSV headers do not match the generated schema")
            ids = set()
            row_count = 0
            required = set(schema.get("required") or [])
            for row_number, row in enumerate(reader, start=2):
                row_count += 1
                record_id = row.get("id", "")
                if not record_id:
                    errors.append(f"{table} row {row_number}: missing id")
                elif record_id in ids:
                    errors.append(f"{table} row {row_number}: duplicate id {record_id}")
                ids.add(record_id)
                for field in required:
                    if row.get(field, "") == "":
                        errors.append(f"{table} row {row_number}: missing required {field}")
                for field, spec in properties.items():
                    validate_value(table, row_number, field, row.get(field, ""), spec, errors)
            if row_count != expected_count:
                errors.append(f"{table}: manifest has {expected_count} rows, CSV has {row_count}")
            total_rows += row_count

    if errors:
        print("\n".join(errors[:100]))
        raise SystemExit(f"Validation failed with {len(errors)} error(s)")

    print(f"Validated {len(manifest_counts)} tables and {total_rows} rows with no compatibility errors.")


if __name__ == "__main__":
    main()
