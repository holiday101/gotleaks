"""Resend wrapper for sending resident notification emails.

Kept provider-specific code isolated to this one module -- if the sending
service ever changes (e.g. Resend -> SES), only this file should need to
change, not the endpoints or templates that call it.
"""
from __future__ import annotations

import os

import resend


class EmailNotConfigured(Exception):
    pass


def send_email(to: str, subject: str, html: str) -> str:
    """Sends one email, returns the provider's message id. Raises
    EmailNotConfigured if the required .env values aren't set, or
    resend.exceptions.ResendError (propagated) if the send itself fails."""
    api_key = os.environ.get("RESEND_API_KEY")
    from_address = os.environ.get("EMAIL_FROM_ADDRESS")
    from_name = os.environ.get("EMAIL_FROM_NAME", "Providence City Utility Billing")

    if not api_key or not from_address:
        raise EmailNotConfigured("RESEND_API_KEY and EMAIL_FROM_ADDRESS must be set in .env")

    resend.api_key = api_key
    result = resend.Emails.send(
        {
            "from": f"{from_name} <{from_address}>",
            "to": [to],
            "subject": subject,
            "html": html,
        }
    )
    return result["id"]
