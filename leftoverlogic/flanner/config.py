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
# KNOT_MODE = "dev" (default) or "prod". In prod mode we swap to the real
# merchant accounts. NEVER call /cart/checkout without simulate=failed —
# there is no prod-safe checkout function in this codebase by design.
KNOT_MODE = os.environ.get("KNOT_MODE", "dev").lower().strip()
if KNOT_MODE not in ("dev", "prod"):
    raise RuntimeError(f"KNOT_MODE must be 'dev' or 'prod', got {KNOT_MODE!r}")

if KNOT_MODE == "prod":
    KNOT_CLIENT_ID = os.environ["KNOT_PROD_CLIENT_ID"]
    KNOT_SECRET = os.environ["KNOT_PROD_SECRET"]
    KNOT_BASE_URL = os.environ.get("KNOT_PROD_BASE_URL", "https://production.knotapi.com")
else:
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

# ─── LLM: AI Studio (Gemini / Gemma) ──────────────────────────────────
# `google-genai` client in api_key mode — same key works for both
# Gemini and Gemma family. We default to Gemini 2.5 Flash because
# (a) multimodal with stronger OCR than Gemma 3 27B (less hallucination
# on brand logos / fast-food wrappers), (b) supports `system_instruction`
# and JSON mode natively, and (c) is still on the free tier.
GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY", "").strip()
AI_STUDIO_MODEL = os.environ.get("AI_STUDIO_MODEL", "gemma-4-31b-it")
# Legacy GCP knobs kept in case future code wants Vertex-side models.
GCP_PROJECT_ID = os.environ.get("GCP_PROJECT_ID", "theta-bliss-486220-s1")
GCP_LOCATION = os.environ.get("GCP_LOCATION", "us-central1")

# ─── Feature flags ─────────────────────────────────────────────────────
FORCE_MOCK = os.environ.get("FORCE_MOCK", "").lower() in ("1", "true", "yes")

# ─── Plan generation tunables ──────────────────────────────────────────
# Prefer the Rainforest-sourced real-ASIN catalog when it exists and we're
# in prod. Dev keeps using the hand-invented pattern catalog so sandbox
# behavior stays deterministic regardless of prod catalog state.
_CATALOG_PROD = DATA_DIR / "amazon_fresh_catalog_prod.json"
_CATALOG_DEV = DATA_DIR / "amazon_fresh_catalog.json"
if KNOT_MODE == "prod" and _CATALOG_PROD.exists():
    try:
        import json as _json
        with _CATALOG_PROD.open() as _f:
            if (_json.load(_f) or {}).get("items"):
                CATALOG_PATH = _CATALOG_PROD
            else:
                CATALOG_PATH = _CATALOG_DEV
    except Exception:
        CATALOG_PATH = _CATALOG_DEV
else:
    CATALOG_PATH = _CATALOG_DEV
CART_ITEM_CAP = 10
MAX_ROUNDS = 5

# ─── MongoDB ───────────────────────────────────────────────────────────
MONGO_URI = os.environ.get("MONGO_URI")
MONGO_DB_NAME = os.environ.get("MONGO_DB", "flanner")

# ─── Runtime files ─────────────────────────────────────────────────────
ADHERENCE_JSONL = ROOT / "adherence.jsonl"
WEBHOOKS_JSONL = ROOT / "webhooks.jsonl"
