"""Generate private, idempotent SQL batches from prepared Base44 CSV files."""

import csv
import json
from pathlib import Path

from prepare_base44_import import MANIFEST_FILE, PRIVATE_DIR


OUTPUT_DIR = PRIVATE_DIR.parent / "base44-import-sql"
CHUNK_SIZE = 2500

IMPORT_ORDER = [
    "payment_fee_settings",
    "payment_settings",
    "ss_pricing_rules",
    "vendors",
    "vendor_pricing",
    "products",
    "garment_catalog_items",
    "ss_catalog_items",
    "quote_requests",
    "quotes",
    "orders",
    "vendor_orders",
    "vendor_order_drafts",
    "customer_notifications",
    "order_status_history",
    "carts",
    "wishlists",
    "contact_messages",
    "newsletter_subscribers",
    "reviews",
]


def ident(value):
    return '"' + value.replace('"', '""') + '"'


def literal(value):
    if value == "":
        return "null"
    if "\x00" in value:
        raise ValueError("PostgreSQL text values cannot contain null bytes")
    return "'" + value.replace("'", "''") + "'"


def write_batch(table, headers, rows, batch_number):
    path = OUTPUT_DIR / f"{IMPORT_ORDER.index(table) + 1:02d}_{table}_{batch_number:03d}.sql"
    columns = ", ".join(ident(header) for header in headers)
    values = ",\n".join(
        "  (" + ", ".join(literal(row[header]) for header in headers) + ")"
        for row in rows
    )
    sql = (
        "begin;\n"
        "set local statement_timeout = 0;\n"
        f"insert into public.{ident(table)} ({columns}) values\n{values}\n"
        "on conflict (id) do nothing;\n"
        "commit;\n"
    )
    path.write_text(sql, encoding="utf-8")
    return path


def main():
    manifest = json.loads(MANIFEST_FILE.read_text(encoding="utf-8"))
    counts = {item["table"]: item["rows"] for item in manifest["tables"]}
    excluded = set(manifest["excluded_from_initial_import"])
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    for old_file in OUTPUT_DIR.glob("*.sql"):
        old_file.unlink()

    batches = []
    for table in IMPORT_ORDER:
        if table in excluded or counts.get(table, 0) == 0:
            continue
        csv_path = PRIVATE_DIR / f"{table}.csv"
        with csv_path.open(encoding="utf-8", newline="") as handle:
            reader = csv.DictReader(handle)
            rows = []
            batch_number = 1
            for row in reader:
                rows.append(row)
                if len(rows) == CHUNK_SIZE:
                    path = write_batch(table, reader.fieldnames, rows, batch_number)
                    batches.append({"table": table, "rows": len(rows), "file": path.name})
                    rows = []
                    batch_number += 1
            if rows:
                path = write_batch(table, reader.fieldnames, rows, batch_number)
                batches.append({"table": table, "rows": len(rows), "file": path.name})

    (OUTPUT_DIR / "manifest.json").write_text(
        json.dumps({"batches": batches}, indent=2), encoding="utf-8"
    )
    print(f"Generated {len(batches)} SQL batches containing {sum(b['rows'] for b in batches)} rows.")


if __name__ == "__main__":
    main()
