"""Merge-tag substitution for the resident-notification email template.

Canonical tag syntax in a saved template is {{snake_case}}. Uploaded .docx
files (like Providence City's own letter template) use [Bracket_Case]
instead -- UPLOAD_FIELD_MAP translates the known field names on upload so
the result drops straight into the same renderer.
"""
from __future__ import annotations

import re
from datetime import date

# (tag, label) -- drives both rendering and the frontend's merge-field picker.
MERGE_FIELDS = [
    ("resident_name", "Resident name"),
    ("service_address", "Service address"),
    ("letter_date", "Letter date"),
    ("prior_7day_usage_gal", "Prior 7-day usage (gal)"),
    ("continuous_flow_gph", "Continuous flow rate (gal/hr)"),
    ("estimated_leak_gal", "Estimated 7-day leak volume (gal)"),
    ("sender_name", "Sender name"),
]

# Maps the source .docx's [Bracket] placeholders to this app's {{tag}}
# syntax. City/Zip aren't included: the billing database stores one combined
# address string (customer_billing.location), not separate city/zip fields.
UPLOAD_FIELD_MAP = {
    "Letter_Date": "letter_date",
    "Resident_Name": "resident_name",
    "Service_Address": "service_address",
    "Prior_7Day_Usage_Gal": "prior_7day_usage_gal",
    "Continuous_Flow_GPH": "continuous_flow_gph",
    "Estimated_Leak_Gal": "estimated_leak_gal",
    "Your Name": "sender_name",
    "Your_Name": "sender_name",
}

_TAG_RE = re.compile(r"\{\{\s*(\w+)\s*\}\}")
_BRACKET_RE = re.compile(r"\[(" + "|".join(re.escape(k) for k in UPLOAD_FIELD_MAP) + r")\]")
_LEFTOVER_BRACKET_RE = re.compile(r"\[[A-Za-z0-9_ ]+\]")


def translate_uploaded_placeholders(html: str) -> tuple[str, list[str]]:
    """[Resident_Name] -> {{resident_name}}, for a freshly-uploaded docx.
    Returns (translated_html, leftover_placeholders) -- leftovers are
    bracket-style text left untouched because it doesn't match a known
    field (e.g. this app has no separate City/Zip fields -- see
    build_merge_values), so the caller can warn the admin to fix them by hand."""
    translated = _BRACKET_RE.sub(lambda m: "{{" + UPLOAD_FIELD_MAP[m.group(1)] + "}}", html)
    leftovers = sorted(set(_LEFTOVER_BRACKET_RE.findall(translated)))
    return translated, leftovers


def render(template_str: str, values: dict[str, str]) -> str:
    return _TAG_RE.sub(lambda m: str(values.get(m.group(1), m.group(0))), template_str)


def build_merge_values(row: dict, sender_name: str, sort_by: str = "min_consumption") -> dict[str, str]:
    """row is one record from queries.get_continuous_users (or a lookup by miu_id)."""
    flow_gph = row.get(sort_by) or row.get("min_consumption") or 0
    prior_7day_gal = row.get("total_consumption") or 0
    estimated_leak_gal = flow_gph * 24 * 7

    def _round(n):
        return f"{round(n):,}"

    return {
        "resident_name": row.get("customer_name") or "Resident",
        "service_address": row.get("address") or "",
        "letter_date": date.today().strftime("%B %-d, %Y"),
        "prior_7day_usage_gal": _round(prior_7day_gal),
        "continuous_flow_gph": _round(flow_gph),
        "estimated_leak_gal": _round(estimated_leak_gal),
        "sender_name": sender_name,
    }
