"""
Shared MongoDB client. Sync (pymongo) — all consumers here are blocking,
so motor's async would be overkill.

Collections match db.md §3:
    users, transactions, catalog_items, plans,
    cart_operations, webhook_events, adherence
"""
from __future__ import annotations

from typing import Optional

from pymongo import MongoClient
from pymongo.collection import Collection
from pymongo.database import Database

from . import config

_client: Optional[MongoClient] = None


def _connect() -> MongoClient:
    global _client
    if _client is None:
        if not config.MONGO_URI:
            raise RuntimeError("MONGO_URI not set in .env")
        _client = MongoClient(config.MONGO_URI, serverSelectionTimeoutMS=5000)
    return _client


def get_db() -> Database:
    return _connect()[config.MONGO_DB_NAME]


def ping() -> bool:
    try:
        _connect().admin.command("ping")
        return True
    except Exception:
        return False


def available() -> bool:
    """Best-effort check for code paths that want silent Atlas fallback."""
    if not config.MONGO_URI:
        return False
    return ping()


# ─── Collection accessors ──────────────────────────────────────────────

def users() -> Collection:            return get_db().users
def transactions() -> Collection:     return get_db().transactions
def catalog_items() -> Collection:    return get_db().catalog_items
def plans() -> Collection:            return get_db().plans
def cart_operations() -> Collection:  return get_db().cart_operations
def webhook_events() -> Collection:   return get_db().webhook_events
def adherence() -> Collection:        return get_db().adherence
