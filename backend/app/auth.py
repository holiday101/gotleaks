"""Session auth for the GotLeaks API.

Ports the Streamlit app's email/password login (app_users table, checked via
neptune_db.verify_user_password) to a stateless signed-cookie session so the
Next.js frontend can gate pages by role, same three-tier ladder as before:
viewer < admin < global.

No new DB table -- the cookie itself is the session, signed with SECRET_KEY
so it can't be forged, and self-expiring via itsdangerous's max_age check.
Logging out just deletes the cookie; a stolen cookie stays valid until it
expires (SESSION_MAX_AGE below) -- same trust model Streamlit's
st.session_state effectively had (no server-side revocation there either).
"""
from __future__ import annotations

import os

from fastapi import Cookie, HTTPException, Response
from itsdangerous import BadSignature, SignatureExpired, URLSafeTimedSerializer

from app import neptune_db as db

SESSION_COOKIE = "gotleaks_session"
SESSION_MAX_AGE = 60 * 60 * 24 * 14  # 14 days

ROLE_RANK = {"viewer": 0, "admin": 1, "global": 2}

# PUBLIC_MODE off (local/private use, e.g. Jared's own machine) grants
# everyone "global" with no login required -- matches the Streamlit app's
# NEPTUNE_PUBLIC_MODE=false behavior exactly.
PUBLIC_MODE = os.environ.get("NEPTUNE_PUBLIC_MODE", "false").strip().lower() == "true"
COOKIE_SECURE = os.environ.get("COOKIE_SECURE", "false").strip().lower() == "true"


def _serializer() -> URLSafeTimedSerializer:
    secret = os.environ.get("SECRET_KEY")
    if not secret:
        raise RuntimeError(
            "SECRET_KEY is not set in .env -- required whenever NEPTUNE_PUBLIC_MODE=true "
            "(generate one with: python3 -c 'import secrets; print(secrets.token_hex(32))')"
        )
    return URLSafeTimedSerializer(secret, salt="gotleaks-session")


def issue_session_cookie(response: Response, user: dict) -> None:
    token = _serializer().dumps({"id": user["id"], "email": user["email"], "role": user["role"]})
    response.set_cookie(
        SESSION_COOKIE,
        token,
        max_age=SESSION_MAX_AGE,
        httponly=True,
        secure=COOKIE_SECURE,
        samesite="lax",
        path="/",
    )


def clear_session_cookie(response: Response) -> None:
    response.delete_cookie(SESSION_COOKIE, path="/")


def _decode(token: str | None) -> dict | None:
    if not token:
        return None
    try:
        return _serializer().loads(token, max_age=SESSION_MAX_AGE)
    except (BadSignature, SignatureExpired):
        return None


def get_current_user(gotleaks_session: str | None = Cookie(default=None)) -> dict | None:
    """FastAPI dependency: the logged-in user (id/email/role), or -- when
    PUBLIC_MODE is off -- a synthetic 'global' user so every endpoint just
    works without a login prompt, same as running the Streamlit app locally."""
    if not PUBLIC_MODE:
        return {"id": None, "email": "local", "role": "global"}
    return _decode(gotleaks_session)


def require_role(min_role: str):
    """FastAPI dependency factory: 401 if not logged in (only possible when
    PUBLIC_MODE is on), 403 if logged in but under-ranked."""
    min_rank = ROLE_RANK[min_role]

    def dependency(gotleaks_session: str | None = Cookie(default=None)) -> dict:
        user = get_current_user(gotleaks_session)
        if user is None:
            raise HTTPException(status_code=401, detail="Not logged in")
        if ROLE_RANK.get(user["role"], -1) < min_rank:
            raise HTTPException(status_code=403, detail=f"Requires a {min_role} account")
        return user

    return dependency
