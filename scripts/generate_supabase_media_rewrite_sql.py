"""Generate private SQL that rewrites Base44 URLs to Supabase Storage."""

import json
from pathlib import Path

from download_base44_media import MANIFEST_FILE


PROJECT_URL = "https://bxsdajpldrdesnvjiubt.supabase.co"
OUTPUT_FILE = MANIFEST_FILE.parent / "rewrite_urls.sql"
JSON_FIELDS = {
    ("products", "mockup_images"),
    ("orders", "order_items"),
}


def ident(value):
    return '"' + value.replace('"', '""') + '"'


def literal(value):
    return "'" + value.replace("'", "''") + "'"


def main():
    manifest = json.loads(MANIFEST_FILE.read_text(encoding="utf-8"))
    statements = ["begin;", "set local statement_timeout = 0;"]
    replacements = 0
    for item in manifest["files"]:
        if item["access"] == "public":
            new_value = (
                f"{PROJECT_URL}/storage/v1/object/public/storefront-assets/"
                f"{item['object_path']}"
            )
        else:
            new_value = f"supabase://customer-files/{item['object_path']}"
        for reference in item["references"]:
            table = reference["table"]
            field = reference["field"]
            column = ident(field)
            if (table, field) in JSON_FIELDS:
                expression = (
                    f"replace({column}::text, {literal(item['url'])}, "
                    f"{literal(new_value)})::jsonb"
                )
            else:
                expression = (
                    f"replace({column}, {literal(item['url'])}, {literal(new_value)})"
                )
            statements.append(
                f"update public.{ident(table)} set {column} = {expression} "
                f"where id = {literal(reference['id'])};"
            )
            replacements += 1
    statements.extend(["commit;", ""])
    OUTPUT_FILE.write_text("\n".join(statements), encoding="utf-8")
    print(f"Generated {replacements} URL replacement statements at {OUTPUT_FILE}.")


if __name__ == "__main__":
    main()
