"""
All environment-derived constants and repo paths in one place.

Anyone importing `from flanner import config` gets the same values.
No module should read `os.environ` directly — come here instead so env
surface is auditable and typed.
"""
from __future__ import annotations

import os
from pathlib import Path

from dotenv import load_dotenv

# Repo layout:  leftoverlogic/flanner/config.py
#   PACKAGE_DIR = leftoverlogic/flanner
#   ROOT        = leftoverlogic/            (data, assets, imessage live here)
#   REPO_ROOT   = repo top level            (single .env lives here — shared with Node)
PACKAGE_DIR = Path(__file__).resolve().parent
ROOT = PACKAGE_DIR.parent
REPO_ROOT = ROOT.parent
DATA_DIR = ROOT / "data"
ASSETS_DIR = ROOT / "assets"
IMESSAGE_DIR = ROOT / "imessage"

# Single .env at repo root — shared between Python (flanner) and Node (spectrum_loop.mjs)
load_dotenv(dotenv_path=REPO_ROOT / ".env")

# ─── Knot ──────────────────────────────────────────────────────────────
KNOT_CLIENT_ID = os.environ["KNOT_CLIENT_ID"]
KNOT_SECRET = os.environ["KNOT_SECRET"]
KNOT_BASE_URL = os.environ.get("KNOT_BASE_URL", "https://development.knotapi.com")

# External user id used across users collection + Knot calls
EXTERNAL_USER_ID = os.environ.get("DEMO_USER", "leftoverlogic-dev-user-001")

# Knot merchant ids — hardcoded from dev sandbox /merchant/list probe
MERCHANT_AMAZON = 44
MERCHANT_DOORDASH = 19
MERCHANT_UBER_EATS = 36

# ─── iMessage ──────────────────────────────────────────────────────────
TARGET_PHONE = os.environ.get("LEFTOVERLOGIC_TARGET", "+16178615781")
DEMO_SPACE = os.environ.get("DEMO_SPACE", f"iMessage;-;{TARGET_PHONE}")

# ─── LLM: K2 primary ───────────────────────────────────────────────────
K2_API_KEY = os.environ.get("K2_API_KEY", "").strip()
K2_BASE_URL = os.environ.get("K2_BASE_URL", "https://api.k2think.ai/v1")
K2_MODEL = os.environ.get("K2_MODEL", "MBZUAI-IFM/K2-Think-v2")

# ─── LLM: Gemini fallback (Vertex AI, GCP) ─────────────────────────────
GCP_PROJECT_ID = os.environ.get("GCP_PROJECT_ID", "theta-bliss-486220-s1")
GCP_LOCATION = os.environ.get("GCP_LOCATION", "us-central1")
GEMINI_MODEL = os.environ.get("GEMINI_MODEL", "gemini-2.0-flash")

# ─── Feature flags ─────────────────────────────────────────────────────
FORCE_MOCK = os.environ.get("FORCE_MOCK", "").lower() in ("1", "true", "yes")

# ─── Plan generation tunables ──────────────────────────────────────────
CATALOG_PATH = DATA_DIR / "amazon_fresh_catalog.json"
CART_ITEM_CAP = 10
MAX_ROUNDS = 5

# ─── MongoDB ───────────────────────────────────────────────────────────
MONGO_URI = os.environ.get("MONGO_URI")
MONGO_DB_NAME = os.environ.get("MONGO_DB", "flanner")

# ─── Runtime files ─────────────────────────────────────────────────────
ADHERENCE_JSONL = ROOT / "adherence.jsonl"
WEBHOOKS_JSONL = ROOT / "webhooks.jsonl"
