"""Request / job scoped context for logging and audit correlation.

Uses ``contextvars`` so async tasks and workers can attach ``request_id`` and
``user`` (email or id) without threading request objects through every call.
"""
from __future__ import annotations

from contextlib import contextmanager
from contextvars import ContextVar, Token
from typing import Iterator, Optional

_request_id: ContextVar[str] = ContextVar("actira_request_id", default="-")
_user: ContextVar[str] = ContextVar("actira_user", default="-")
_user_id: ContextVar[str] = ContextVar("actira_user_id", default="-")
_user_role: ContextVar[str] = ContextVar("actira_user_role", default="-")


def get_request_id() -> str:
    return _request_id.get() or "-"


def get_user() -> str:
    """Human-readable principal: email preferred, else user id, else '-'."""
    return _user.get() or "-"


def get_user_id() -> str:
    return _user_id.get() or "-"


def get_user_role() -> str:
    return _user_role.get() or "-"


def set_request_id(value: Optional[str]) -> Token:
    return _request_id.set((value or "").strip() or "-")


def set_user(
    *,
    email: Optional[str] = None,
    user_id: Optional[str] = None,
    role: Optional[str] = None,
) -> tuple[Token, Token, Token]:
    """Bind principal for the current async context. Returns reset tokens."""
    uid = (user_id or "").strip() or "-"
    em = (email or "").strip()
    label = em or (uid if uid != "-" else "-")
    t_user = _user.set(label)
    t_id = _user_id.set(uid)
    t_role = _user_role.set((role or "").strip() or "-")
    return t_user, t_id, t_role


def clear_user() -> None:
    _user.set("-")
    _user_id.set("-")
    _user_role.set("-")


def reset_context(
    *,
    request_id_token: Optional[Token] = None,
    user_tokens: Optional[tuple[Token, Token, Token]] = None,
) -> None:
    if request_id_token is not None:
        _request_id.reset(request_id_token)
    if user_tokens is not None:
        t_user, t_id, t_role = user_tokens
        _user.reset(t_user)
        _user_id.reset(t_id)
        _user_role.reset(t_role)


@contextmanager
def bind_log_context(
    *,
    request_id: Optional[str] = None,
    email: Optional[str] = None,
    user_id: Optional[str] = None,
    role: Optional[str] = None,
) -> Iterator[None]:
    """Temporarily bind request/user fields (HTTP middleware or job worker)."""
    rid_tok = set_request_id(request_id) if request_id is not None else None
    user_toks = None
    if email is not None or user_id is not None or role is not None:
        user_toks = set_user(email=email, user_id=user_id, role=role)
    try:
        yield
    finally:
        reset_context(request_id_token=rid_tok, user_tokens=user_toks)
