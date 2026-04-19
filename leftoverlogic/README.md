# leftoverlogic

Backend + iMessage orchestrator for **Flanner** (flanner.health · HackPrinceton S26 Knot track).

## Layout

```
leftoverlogic/
├── flanner/                 ← Python package (importable: `from flanner import plan`)
│   ├── config.py              env-driven constants, paths
│   ├── knot.py                Knot API wrappers (/cart, /cart/checkout)
│   ├── llm.py                 K2 Think V2 + Vertex Gemini + mock
│   ├── catalog.py             Amazon Fresh catalog loader + filter
│   ├── plan.py                orchestrator: generate_plan, place_order
│   ├── intent.py              YES/PASS/MODIFY/UNKNOWN parser (KO/EN)
│   ├── format.py              user-facing iMessage text
│   ├── checkin.py             daily /checkin, adherence classification
│   ├── db.py                  MongoDB singleton + collection accessors
│   ├── persist.py             write-through helpers (plans, carts, adherence)
│   └── cli.py                 stdin/stdout JSON bridge for spectrum_loop.mjs
│
├── imessage/                ← Node orchestrator (spectrum-ts)
│   └── spectrum_loop.mjs      reactive iMessage + terminal loop
│
├── scripts/                 ← one-off Mongo maintenance
│   ├── ensure_indexes.py      idempotent index creator
│   ├── seed_catalog.py        data/amazon_fresh_catalog.json → catalog_items
│   └── seed_transactions.py   data/{sync_*,mock_*} + knot_api_data/mock_data.json → transactions
│
├── data/                    ← static seed data (committed)
│   ├── amazon_fresh_catalog.json
│   ├── sync_amazon.json, sync_doordash.json     (Knot sandbox dumps)
│   ├── mock_doordash_food.json                  (one mock restaurant order)
│   └── merchants/                               (Knot /merchant/list probe results)
│
├── sandbox/                 ← historical Knot API exploration (01-09 scripts, webhook_server, probe)
├── assets/meals/            ← optional meal images auto-attached to iMessage
├── requirements.txt         ← pymongo, pymongo[srv], google-genai, requests, dotenv, fastapi
└── README.md

# Secrets live at the repo root, shared between Python and Node:
#   <repo>/.env           (gitignored)
#   <repo>/.env.example   (committed template)
```

## Setup

```bash
# One shared .env at the repo root (Python + Node both read it)
cp ../.env.example ../.env   # then fill in Knot, K2, MONGO_URI creds

cd leftoverlogic
python -m venv .venv
.venv/bin/python -m pip install -r requirements.txt

cd imessage && npm install && cd ..

# First-time Mongo setup
.venv/bin/python scripts/ensure_indexes.py
.venv/bin/python scripts/seed_catalog.py
.venv/bin/python scripts/seed_transactions.py
```

## Run the iMessage loop

```bash
cd imessage && node spectrum_loop.mjs
```

macOS Full Disk Access required (System Settings → Privacy & Security).

## CLI (manual test or alternate frontend)

```bash
# Generate a weekly plan (stdout = JSON)
echo '{"feedback_history": ["no shrimp, under $50"]}' | \
  .venv/bin/python -m flanner.cli generate

# Parse a user reply
echo '{"text": "yes"}' | .venv/bin/python -m flanner.cli parse

# See all verbs
.venv/bin/python -m flanner.cli
```

Verbs: `generate`, `order`, `parse`, `checkin_prompt`, `checkin_record`,
`adherence`, `plan_status`.

## Pipeline at a glance

```
iMessage in  →  spectrum_loop.mjs  →  flanner.cli (Python)  →
    ├── plan.generate      (K2 primary, Gemini fallback)  →  plans collection
    ├── plan.place_order   (Knot /cart + /cart/checkout)  →  cart_operations
    ├── checkin.record_reply                              →  adherence
    └── persist.mark_plan_status (YES/PASS/MODIFY)         →  plans.status
```

Flat-file mirrors live in `adherence.jsonl` and `webhooks.jsonl` (gitignored)
as disaster-recovery backup.

See `../db.md` for the full MongoDB schema and access pattern docs.
