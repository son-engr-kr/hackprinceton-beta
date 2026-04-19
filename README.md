# Flanner

> **"A mirror on your delivery habits."**
> HackPrinceton Spring 2026 — **Knot** sponsor track.

Flanner takes ~6 months of a user's real delivery-food history (via **Knot TransactionLink**), auto-derives the ingredients that would go into those meals, assembles a grocery cart, and proposes a **weekly home-cooked meal plan** with healthier swaps. When the user approves, we push the cart into their real **Amazon Fresh** account via **Knot AgenticShopping** — stopping one tap before checkout so no charge is ever made without their consent.

- 🌐 **Live**: https://flanner.health
- 🔧 **Backend**: https://flanner-api-318799600047.us-central1.run.app (`api.flanner.health` once SSL finishes provisioning)
- 📅 **Event**: HackPrinceton Spring 2026 · Princeton University · Apr 17–19, 2026
- 🎯 **Target track**: Knot ($500, delivery heatmap fit)

---

## What the demo shows

1. **Delivery review** — pulls transactions from MongoDB (seeded from ~6 months of DoorDash / Uber Eats / Grubhub orders via Knot); ranks top foods, restaurants, monthly spend, sodium intake.
2. **Ingredient burst** — for every past order, automatically decomposes the dish into ingredients using **K2 Think V2** (MBZUAI) with a pantry-aware prompt.
3. **Grocery cart** — aggregates all ingredients, looks up real **Amazon ASINs** (curated real Amazon Fresh items + Rainforest API-sourced ASINs), shows estimated price.
4. **Weekly plan** — K2 proposes 7 home-cooked recipes that use only pantry + cart items, respecting user's dietary constraints, Google Calendar events, and adherence history.
5. **Cart push** — "Order it" button calls Knot `/cart` in **production mode** — items land in the presenter's real Amazon Fresh cart within seconds. Checkout is intentionally *not* automated (safety: `simulate=failed` baked into the code; no real-checkout function exists).
6. **Impact** — before/after comparison: sodium reduced, calories trimmed, protein improved, money saved.
7. **Daily check-in** — `/chat` page: typewriter-style Gemma conversation that asks "Did you eat today?" every evening. User replies (free text or choices) are saved to Mongo `adherence`; adherence summary feeds back into next week's plan.

All dynamic data (transactions, plans, pantry, adherence, linked merchants, cart ops) is read/written through the FastAPI backend against MongoDB Atlas. Static metadata (food catalog, recipe definitions, mascot assets) still ships as frontend code for determinism during demos.

---

## Architecture

```
┌───────────────────────────────────────────────────────────────────────┐
│                              flanner.health                           │
│                               (Vercel CDN)                            │
│         ┌────────────────────────────────────────────────┐            │
│         │ Next.js 15 · React 19 · Tailwind 3 · Zustand   │            │
│         │  · Framer Motion · Lucide icons                │            │
│         │                                                │            │
│         │  /app/api/k2-plan       → K2 streaming         │            │
│         │  /app/api/gemma-recognize → Gemini 2.5 Flash   │            │
│         │  /app/api/k2-redteam    → K2 adversarial check │            │
│         └────────────────────────────────────────────────┘            │
└──────────────────────────────────┬────────────────────────────────────┘
                                   │ HTTPS (NEXT_PUBLIC_API_BASE)
                                   ▼
┌───────────────────────────────────────────────────────────────────────┐
│                     api.flanner.health (Cloud Run)                    │
│                     us-central1 · FastAPI · Python 3.11               │
│                                                                       │
│     ┌──────────────┬──────────────┬─────────────┬────────────────┐    │
│     │  /api/plans  │  /api/photo  │ /api/knot/* │ /api/calendar/*│    │
│     │  /api/cart   │  /api/pantry │ /knot       │  (Google OAuth)│    │
│     │  /api/check  │ /api/intent  │  (webhook)  │                │    │
│     └──────┬───────┴──────┬───────┴──────┬──────┴────────┬───────┘    │
│            │              │              │               │            │
│            ▼              ▼              ▼               ▼            │
└────────────┼──────────────┼──────────────┼───────────────┼────────────┘
             │              │              │               │
             ▼              ▼              ▼               ▼
   ┌──────────────────┐ ┌─────────┐ ┌──────────────┐ ┌────────────────┐
   │ MongoDB Atlas    │ │ Gemini  │ │ Knot API     │ │ Google Calendar│
   │ (mirrormeal DB)  │ │ (vision │ │ production   │ │  OAuth 2.0     │
   │  - users         │ │  OCR +  │ │ .knotapi.com │ │  (readonly)    │
   │  - transactions  │ │  food   │ │  - /cart     │ │                │
   │  - plans         │ │  recog) │ │  - /session  │ │                │
   │  - pantry        │ └─────────┘ │  - /merchant │ └────────────────┘
   │  - adherence     │             └──────────────┘
   │  - catalog_items │                    │
   │  - cart_ops      │                    │ webhook
   │  - webhook_evts  │ ◄──────────────────┘ (AUTHENTICATED,
   │  - photo_logs    │                      SYNC_CART_SUCCEEDED,
   └──────────────────┘                      etc.)

   ┌────────────────────────────────────────────────────────┐
   │  NOT deployed — runs on presenter's Mac for demo       │
   │  leftoverlogic/imessage/spectrum_loop.mjs  (Node.js)   │
   │    ↓  spectrum-ts framework · @photon-ai/imessage-kit  │
   │  Bridges real iMessage ↔ flanner.cli (Python stdin/out)│
   │  Photon ($400/$100 prize track)                        │
   └────────────────────────────────────────────────────────┘
```

### Tech stack

| Layer | Technology |
|-------|------------|
| Frontend | Next.js 15 (app router) · React 19 · Tailwind 3 · Framer Motion 11 · Zustand 5 (`persist`) |
| Frontend hosting | Vercel (auto HTTPS, custom domain `flanner.health`) |
| Backend | FastAPI · Python 3.11 · Pydantic · `uvicorn[standard]` |
| Backend hosting | Google Cloud Run (us-central1, 1 CPU / 1 GiB, autoscale 0–3) |
| DB | MongoDB Atlas (`mirrormeal`, cluster0, SRV) |
| LLM — plan / reasoning | **K2 Think V2** via `api.k2think.ai/v1` (MBZUAI-IFM/K2-Think-v2) |
| LLM — vision / recognition | **Gemini 2.5 Flash** (`google-genai` SDK) |
| LLM — local check-in | Gemma 4 (`gemma4:e4b-it-q4_K_M` on Ollama, local only) |
| Delivery / cart | **Knot API** — `TransactionLink` + `AgenticShopping` (prod) |
| iMessage | Photon `spectrum-ts` + `@photon-ai/imessage-kit` (Mac-only, not Cloud Run) |
| Product search | Rainforest API (Amazon ASIN discovery) |
| Image generation | SDXL / Playground / Dreamshaper via Diffusers (Apple Silicon MPS) |
| DNS / Domain | Porkbun (registrar + DNS) · Vercel A records · Cloud Run domain mapping |

---

## Repository layout

```
.
├── ande-app/                ← Next.js frontend (deployed to Vercel)
│   ├── app/
│   │   ├── (app)/           ← authenticated screens (page shell + route group)
│   │   │   ├── page.tsx         dashboard / experience
│   │   │   ├── plan/            weekly plan composer
│   │   │   ├── cart/            grocery cart + Knot push
│   │   │   ├── chat/            daily Gemma check-in (typable)
│   │   │   ├── history/         6-month delivery timeline
│   │   │   ├── impact/          before/after macros + sodium
│   │   │   └── settings/        goals, dietary, connections
│   │   ├── api/                 Next.js server routes (K2 / Gemma)
│   │   └── onboarding/          first-run flow (outside route group)
│   ├── components/
│   │   ├── AssetImage.tsx       PNG with emoji fallback
│   │   ├── OnboardingGate.tsx   Zustand hydration + redirect
│   │   └── reasoning/           K2 trace visualizers
│   └── lib/
│       ├── api.ts               backend API client (typed)
│       ├── adapters.ts          backend → frontend shape mapping
│       ├── hooks.ts             useUser, useDeliveryStats, useLinkedMerchants, …
│       ├── store.ts             Zustand persist store
│       └── mock/                static metadata (FOODS, RECIPES, INGREDIENTS, …)
│
├── leftoverlogic/           ← Python backend (deployed to Cloud Run)
│   ├── flanner/                 FastAPI package
│   │   ├── api.py               HTTP endpoints — thin layer over Mongo
│   │   ├── plan.py              K2 plan generation + Knot cart push
│   │   ├── knot.py              Knot API wrapper (dev/prod mode switching)
│   │   ├── webhook.py           /knot/* webhook dispatcher
│   │   ├── checkin.py           adherence logging
│   │   ├── pantry.py            ingredient bookkeeping
│   │   ├── vision.py            Gemini photo recognition
│   │   ├── gcal.py              Google Calendar OAuth + event fetch
│   │   ├── llm.py               K2 / Gemini clients
│   │   ├── catalog.py           Amazon Fresh ASIN catalog loader
│   │   ├── config.py            env + paths (single source of truth)
│   │   └── db.py                Mongo connection + collection accessors
│   ├── imessage/                Mac-only (NOT deployed)
│   │   └── spectrum_loop.mjs    Photon spectrum-ts orchestrator
│   ├── scripts/                 seed/fetch utilities
│   ├── data/                    shipped JSON catalogs
│   ├── Dockerfile               → Artifact Registry → Cloud Run
│   └── requirements.txt
│
├── ande-image-gen/          ← SDXL image pipeline (local, Apple Silicon)
│   ├── prompts.yaml             food / ingredient / mascot / meal prompts
│   ├── generate_images.py       SDXL / Playground / Turbo / Dreamshaper
│   └── images/                  generated PNGs (gitignored)
│
├── brainstorming/           ← hackathon packet, sponsor strategy (read-only)
├── figma-design/            ← visual design explorations
├── knot-prod.md             ← prod-mode feasibility + demo runbook
├── knot-prod-runbook.md     ← step-by-step demo script
└── README.md                ← this file
```

---

## Live deployment map

| Surface | URL | Hosted on |
|---------|-----|-----------|
| Marketing + app (apex) | https://flanner.health | Vercel |
| Marketing + app (www) | https://www.flanner.health | Vercel |
| API (pending SSL) | https://api.flanner.health | Cloud Run via domain mapping |
| API (direct) | https://flanner-api-318799600047.us-central1.run.app | Cloud Run |
| Knot webhook receiver | `{api}/knot` | Cloud Run |

DNS records (Porkbun):
```
A      @     216.198.79.1                             (Vercel apex)
A      @     64.29.17.1                               (Vercel apex)
CNAME  www   5ef2cfc2ce3fab27.vercel-dns-017.com      (Vercel)
CNAME  api   ghs.googlehosted.com                     (Cloud Run)
TXT    @     google-site-verification=...             (domain ownership)
```

---

## Local development

### Prerequisites

- **Node.js 20+** — frontend (`brew install node`)
- **Python 3.11** + **uv** — backend + image-gen (`brew install uv`)
- **MongoDB Atlas connection string** — ask repo owner
- **gcloud CLI** + auth — only if deploying backend (`brew install --cask google-cloud-sdk`)
- **vercel CLI** + auth — only if deploying frontend (`npm i -g vercel`)

### 1. Environment

Single `.env` at repo root (shared by Python backend and Node frontend via `next.config.ts` loader):

```bash
# Knot — dev sandbox (default) OR prod (demo day)
KNOT_MODE=dev
KNOT_CLIENT_ID=...
KNOT_SECRET=...
KNOT_BASE_URL=https://development.knotapi.com
KNOT_PROD_CLIENT_ID=...
KNOT_PROD_SECRET=...
KNOT_PROD_BASE_URL=https://production.knotapi.com

# LLM
K2_API_KEY=IFM-...
K2_BASE_URL=https://api.k2think.ai/v1
K2_MODEL=MBZUAI-IFM/K2-Think-v2
GEMINI_API_KEY=AIza...

# DB
MONGO_URI=mongodb+srv://USER:PASS@cluster0.xxxxx.mongodb.net/mirrormeal?retryWrites=true&w=majority
MONGO_DB=mirrormeal

# Photon (iMessage, optional — local Mac only)
PHOTON_PROJECT_ID=...
PHOTON_PROJECT_SECRET=...

# Optional
RAINFOREST_API_KEY=...
```

### 2. Backend (FastAPI)

```bash
cd leftoverlogic
uv venv --python 3.11 .venv
uv pip install -r requirements.txt
uv run uvicorn flanner.api:app --reload --port 8000
# → http://localhost:8000/api/health
```

### 3. Frontend (Next.js)

```bash
cd ande-app
npm install
NEXT_PUBLIC_API_BASE=http://localhost:8000 npm run dev
# → http://localhost:3000
```

The frontend calls backend endpoints via `lib/api.ts` (`API_BASE = process.env.NEXT_PUBLIC_API_BASE`). In production this points at the Cloud Run URL.

### 4. iMessage orchestrator (optional, macOS only)

```bash
cd leftoverlogic/imessage
npm install
node spectrum_loop.mjs
```

Requires macOS (Photon reads from the local iMessage SQLite DB). Not containerizable; runs on the presenter's laptop during demo.

### 5. Regenerating product images (optional, Apple Silicon)

```bash
cd ande-image-gen
uv venv --python 3.11 .venv
uv pip install -r requirements.txt
uv run python generate_images.py --all --skip-existing
```

First run downloads SDXL (~6.5 GB) + rembg U²-Net (~170 MB). See the original `ande-image-gen/README.md` for model presets, seed comparison, and the full flag matrix.

---

## Deployment

### Backend → Cloud Run

```bash
cd leftoverlogic
# Build + push image
gcloud builds submit \
  --tag us-central1-docker.pkg.dev/theta-bliss-486220-s1/flanner/api:latest \
  --project=theta-bliss-486220-s1

# Deploy (first time — after that `gcloud run services update` is enough for env changes)
gcloud run deploy flanner-api \
  --image=us-central1-docker.pkg.dev/theta-bliss-486220-s1/flanner/api:latest \
  --region=us-central1 \
  --allow-unauthenticated \
  --env-vars-file=/path/to/env.yaml \
  --memory=1Gi --cpu=1 --timeout=300 \
  --min-instances=0 --max-instances=3 \
  --project=theta-bliss-486220-s1
```

Custom domain mapping (one-time):
```bash
gcloud beta run domain-mappings create \
  --service=flanner-api \
  --domain=api.flanner.health \
  --region=us-central1 \
  --project=theta-bliss-486220-s1
# Requires api.flanner.health CNAME → ghs.googlehosted.com in DNS,
# plus Google Search Console ownership verification.
```

### Frontend → Vercel

```bash
cd ande-app
vercel link --yes --project flanner-web
# Inject env
printf "$K2_API_KEY"      | vercel env add K2_API_KEY      production
printf "$K2_BASE_URL"     | vercel env add K2_BASE_URL     production
printf "$K2_MODEL"        | vercel env add K2_MODEL        production
printf "$GEMINI_API_KEY"  | vercel env add GEMINI_API_KEY  production
printf "https://flanner-api-318799600047.us-central1.run.app" | vercel env add NEXT_PUBLIC_API_BASE production
printf "leftoverlogic-dev-user-001" | vercel env add NEXT_PUBLIC_DEMO_USER_ID production
# Deploy
vercel --prod --yes
```

Custom domain:
- `flanner.health` + `www.flanner.health` added to the project, proven by Vercel's recommended A / CNAME records.

---

## Knot integration (production mode)

| Flow | Endpoint | Purpose |
|------|----------|---------|
| **TransactionLink** (dev) | `POST /session/create` → Web SDK | OAuth into DoorDash / Uber Eats / Grubhub to pull 6-mo delivery history |
| **AgenticShopping** (prod) | `POST /cart` → merchant 44 (Amazon) | Add curated ASINs into real Amazon Fresh cart |
| **Checkout** (stubbed) | `POST /cart/checkout` with `simulate=failed` | ⚠️ intentionally stubbed — NO real checkout function in codebase |
| **Webhooks** | `POST /knot` (Cloud Run) | Receive `AUTHENTICATED`, `SYNC_CART_SUCCEEDED`, `CHECKOUT_*`, `ACCOUNT_LOGIN_REQUIRED`, … |

Mode switching is driven by a single env var:
```bash
KNOT_MODE=dev    # sandbox data, fake users (default)
KNOT_MODE=prod   # real merchant accounts, real Amazon cart
```

The `mirrormeal/knot.py` wrapper normalizes dev vs. prod response shape (`{merchants: [...]}` vs. flat `[...]`).

See **`knot-prod.md`** for the full feasibility report (what changes between dev and prod, what Knot does *not* offer, and the safe demo runbook).

---

## Core flows

### Plan generation (K2 primary, Gemini fallback)

```
POST /api/plans/generate
body: { feedback_history: string[], space_id?: string }

→ flanner.plan.generate(feedback_history, space_id):
    1. Load user's transactions (last 30 days)
    2. Load pantry + catalog
    3. Load upcoming Google Calendar events (if linked)
    4. Load adherence rollup (last 7 days)
    5. Build K2 prompt with all context + dietary constraints
    6. Stream K2 response → parse JSON → validate schema
    7. Persist to plans collection, return plan_id
```

### Cart push (prod)

```
POST /api/plans/{plan_id}/order

→ flanner.plan.place_order(plan):
    1. Pick top-N items from plan.shopping_list
    2. Verify merchant 44 (Amazon) is OAuth-linked for this user
    3. POST /cart (prod) — items land in real Amazon Fresh cart
    4. POST /cart/checkout with simulate=failed (HARD-CODED)
    5. Log to cart_operations collection
    6. Return ordered_items, skipped_items, total_cost
```

### Photo recognition

```
POST /api/photo
body: { image_base64, mime_type?, space_id? }

→ flanner.vision.analyze(image_bytes):
    1. Call Gemini 2.5 Flash with system prompt:
       "Classify: food | receipt | unclear"
    2. If food:  extract dish_name, portions, estimated_kcal → log to adherence
    3. If receipt: parse line items → pantry_deltas
    4. Persist to photo_logs
```

### Daily check-in

```
POST /api/checkin
body: { reply, meal_title?, day?, space_id? }

→ flanner.checkin.record_reply(...):
    classify reply as: cooked | delivery | skipped | unclear
    persist to adherence collection with plan_id + day
    feed into next plan's feedback_history
```

---

## Hackathon reference

- **Event**: HackPrinceton Spring 2026 (April 17–19, 2026, Princeton University)
- **Submission deadline**: 2026-04-19 8 AM
- **Judging**: 9:30 AM – 2 PM on 4/19
- **Target tracks**:
  - **Knot** ($500) — main target; production-grade delivery + cart integration
  - **Photon** ($400 + $400 credits) — real iMessage orchestration via spectrum-ts
- See `brainstorming/S26_Sponsor_Strategy.md` for full track strategy.

---

## Credits

- **K2 Think V2** — MBZUAI Institute of Foundation Models
- **Knot** — transaction / shopping API (HackPrinceton sponsor)
- **Photon** — spectrum-ts + imessage-kit (HackPrinceton sponsor)
- **Google** — Gemini 2.5 Flash (AI Studio) + Cloud Run + Calendar API
- **MongoDB** — Atlas cluster (HackPrinceton promo)
- **Rainforest API** — Amazon product search

Product codename is `ande` in some internal paths; the shipping name is **Flanner**. The Python backend package is `leftoverlogic/flanner/`. Repo name (`hackprinceton-beta`) is organizational.
