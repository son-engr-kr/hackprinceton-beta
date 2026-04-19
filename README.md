<div align="center">

# 🍽️ Flanner

**A mirror on your delivery habits.**

Turn six months of real DoorDash / Uber Eats orders into a weekly
home-cooked meal plan — and auto-fill your Amazon Fresh cart with the
exact ingredients you need, one tap from done.

[![Watch the demo](https://img.shields.io/badge/▶_Watch_2--min_demo-FF0000?style=for-the-badge&logo=youtube&logoColor=white)](https://youtu.be/gfLijC1apBo)
[![Live app](https://img.shields.io/badge/🌐_Live-flanner.health-B5E48C?style=for-the-badge)](https://flanner.health)
[![Backend](https://img.shields.io/badge/🔧_API-Cloud_Run-4285F4?style=for-the-badge&logo=googlecloud&logoColor=white)](https://flanner-api-318799600047.us-central1.run.app/api/health)

**HackPrinceton Spring 2026** · **Healthcare** track

</div>

---

## Table of contents

- [What Flanner does](#what-flanner-does)
- [Live surfaces](#live-surfaces)
- [Architecture](#architecture)
- [Tech stack](#tech-stack)
- [Repository layout](#repository-layout)
- [Local development](#local-development)
- [Deployment](#deployment)
- [Knot integration (production)](#knot-integration-production)
- [Core flows](#core-flows)
- [Hackathon context](#hackathon-context)
- [Credits](#credits)

---

## What Flanner does

Seven-screen guided experience, all driven by a real backend:

| # | Screen | What happens | Data source |
|---|--------|--------------|-------------|
| 1 | **Delivery review** | Ranks top foods, restaurants, monthly spend, sodium | Mongo `transactions` (Knot TransactionLink) |
| 2 | **Ingredient burst** | Decomposes each dish into ingredients | **K2 Think V2** |
| 3 | **Grocery cart** | Aggregates ingredients into real Amazon ASINs | Catalog + Rainforest API |
| 4 | **Weekly plan** | 7 home-cooked recipes respecting calendar + pantry + dietary + adherence | **K2 Think V2** |
| 5 | **Cart push** | `POST /cart` → items in real Amazon Fresh cart | **Knot AgenticShopping** (prod) |
| 6 | **Impact** | Before/after comparison — sodium, calories, protein, savings | Mongo aggregations |
| 7 | **Daily check-in** | Free-text chat + Gemma recognition of food photos | **Gemma 4 31B** (Google AI Studio) |

> **Safe by construction**: `/cart/checkout` is hard-wired to `simulate=failed`.
> There is no `checkout_real()` function anywhere in the repo. Judges see a
> real Amazon cart get populated, never a real charge.

---

## Live surfaces

| Surface | URL |
|---------|-----|
| 🎥 **Demo video (2 min)** | https://youtu.be/gfLijC1apBo |
| 🌐 Frontend (apex) | https://flanner.health |
| 🌐 Frontend (www) | https://www.flanner.health |
| 🔧 Backend (direct) | https://flanner-api-318799600047.us-central1.run.app |
| 🔧 Backend (vanity) | https://api.flanner.health *(SSL provisioning)* |
| 🪝 Knot webhook | `{api}/knot` |

### DNS (Porkbun)

```
A      @     216.198.79.1                             (Vercel apex)
A      @     64.29.17.1                               (Vercel apex)
CNAME  www   5ef2cfc2ce3fab27.vercel-dns-017.com      (Vercel)
CNAME  api   ghs.googlehosted.com                     (Cloud Run)
TXT    @     google-site-verification=...             (domain ownership)
```

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
│         │  /app/api/k2-plan        → K2 streaming        │            │
│         │  /app/api/gemma-recognize → Gemma (AI Studio)  │            │
│         │  /app/api/k2-redteam     → K2 adversarial      │            │
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
└────────────┼──────────────┼──────────────┼───────────────┼────────────┘
             ▼              ▼              ▼               ▼
   ┌──────────────────┐ ┌─────────┐ ┌──────────────┐ ┌────────────────┐
   │ MongoDB Atlas    │ │ Gemma   │ │ Knot API     │ │ Google Calendar│
   │ (mirrormeal DB)  │ │ vision  │ │ production   │ │  OAuth 2.0     │
   │  • users         │ │ + text  │ │.knotapi.com  │ │  (readonly)    │
   │  • transactions  │ │ via AI  │ │  • /cart     │ │                │
   │  • plans         │ │ Studio  │ │  • /session  │ │                │
   │  • pantry        │ └─────────┘ │  • /merchant │ └────────────────┘
   │  • adherence     │             └──────┬───────┘
   │  • catalog_items │                    │ webhook
   │  • cart_ops      │ ◄──────────────────┘ (AUTHENTICATED,
   │  • webhook_evts  │                      SYNC_CART_SUCCEEDED,
   │  • photo_logs    │                      CHECKOUT_*, …)
   └──────────────────┘

   ┌────────────────────────────────────────────────────────┐
   │  NOT deployed — runs on presenter's Mac for demo       │
   │  api/imessage/spectrum_loop.mjs  (Node.js)             │
   │    ↓  Photon spectrum-ts · @photon-ai/imessage-kit     │
   │  Bridges real iMessage ↔ flanner.cli (stdin/stdout)    │
   │  Photon sponsor track ($400 / $100)                    │
   └────────────────────────────────────────────────────────┘
```

---

## Tech stack

| Layer | Technology |
|-------|------------|
| Frontend | Next.js 15 (app router) · React 19 · Tailwind 3 · Framer Motion 11 · Zustand 5 (`persist`) |
| Frontend hosting | Vercel (auto HTTPS · custom domain `flanner.health`) |
| Backend | FastAPI · Python 3.11 · Pydantic · `uvicorn[standard]` |
| Backend hosting | Google Cloud Run (us-central1 · 1 CPU / 1 GiB · autoscale 0–3) |
| Database | MongoDB Atlas (`mirrormeal` cluster) |
| LLM — planning | **K2 Think V2** via `api.k2think.ai/v1` (`MBZUAI-IFM/K2-Think-v2`) |
| LLM — vision & check-in | **Gemma 4 31B** + **Gemma 3 27B** via Google AI Studio |
| Delivery / cart | **Knot API** — TransactionLink + AgenticShopping (production mode) |
| iMessage | Photon `spectrum-ts` + `@photon-ai/imessage-kit` (macOS-only) |
| Product search | Rainforest API (Amazon ASIN discovery) |
| Image generation | SDXL / Playground / Dreamshaper via Diffusers (Apple Silicon) |
| DNS | Porkbun (registrar) · Vercel A records · Cloud Run domain mapping |

---

## Repository layout

```
.
├── web/                        Next.js frontend (deploy target: Vercel)
│   ├── app/
│   │   ├── (app)/              authenticated screens (route group)
│   │   │   ├── page.tsx            dashboard / experience shell
│   │   │   ├── plan/               weekly plan composer
│   │   │   ├── cart/               grocery cart + Knot push
│   │   │   ├── chat/               daily check-in (typable)
│   │   │   ├── history/            6-month delivery timeline
│   │   │   ├── impact/             before/after macros + sodium
│   │   │   └── settings/           goals, dietary, connections
│   │   ├── api/                Next.js server routes (K2 stream / Gemma vision)
│   │   └── onboarding/         first-run flow
│   ├── components/             AssetImage, OnboardingGate, reasoning/*
│   └── lib/
│       ├── api.ts              typed backend client
│       ├── adapters.ts         backend ⇄ frontend shape mapping
│       ├── hooks.ts            useUser, useDeliveryStats, …
│       ├── store.ts            Zustand persist
│       └── mock/               static metadata (FOODS, RECIPES, …)
│
├── api/                        Python backend (deploy target: Cloud Run)
│   ├── flanner/                FastAPI package
│   │   ├── api.py              HTTP endpoints (thin layer over Mongo)
│   │   ├── plan.py             K2 plan generation + Knot cart push
│   │   ├── knot.py             Knot API wrapper (dev/prod mode switch)
│   │   ├── webhook.py          /knot/* webhook dispatcher
│   │   ├── checkin.py          adherence logging (Gemma classifier)
│   │   ├── pantry.py           ingredient bookkeeping
│   │   ├── vision.py           Gemma photo recognition
│   │   ├── gcal.py             Google Calendar OAuth + event fetch
│   │   ├── llm.py              K2 + Gemma clients
│   │   ├── catalog.py          Amazon Fresh ASIN catalog loader
│   │   ├── config.py           env + paths (single source of truth)
│   │   └── db.py               Mongo connection
│   ├── scripts/                seed / fetch utilities
│   ├── data/                   shipped JSON catalogs
│   ├── Dockerfile              → Artifact Registry → Cloud Run
│   └── requirements.txt
│
├── image-gen/                  SDXL image pipeline (local, Apple Silicon)
│   ├── prompts.yaml            food / ingredient / mascot / meal prompts
│   ├── generate_images.py      SDXL / Playground / Turbo / Dreamshaper
│   └── images/                 generated PNGs (gitignored)
│
├── docs/
│   ├── design/                 Figma frames
│   └── runbooks/
│       ├── knot-prod.md        prod-mode feasibility report
│       └── knot-prod-runbook.md step-by-step demo script
│
├── README.md                   this file
└── CLAUDE.md                   agent conventions + project memory
```

---

## Local development

### Prerequisites

- **Node.js 20+** — frontend (`brew install node`)
- **Python 3.11** + **uv** — backend + image-gen (`brew install uv`)
- **MongoDB Atlas URI** — request from repo owner
- **gcloud CLI** — only if deploying backend (`brew install --cask google-cloud-sdk`)
- **vercel CLI** — only if deploying frontend (`npm i -g vercel`)

### Environment

Single `.env` at repo root (shared by Python backend and Node frontend via `next.config.ts`):

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
GEMINI_API_KEY=AIza...           # Google AI Studio key (used for Gemma)
AI_STUDIO_MODEL=gemma-4-31b-it   # optional override

# DB
MONGO_URI=mongodb+srv://USER:PASS@cluster0.xxxxx.mongodb.net/mirrormeal?retryWrites=true&w=majority
MONGO_DB=mirrormeal

# Photon (iMessage, macOS-only)
PHOTON_PROJECT_ID=...
PHOTON_PROJECT_SECRET=...

# Optional
RAINFOREST_API_KEY=...
```

### Run

```bash
# Backend
cd api
uv venv --python 3.11 .venv
uv pip install -r requirements.txt
uv run uvicorn flanner.api:app --reload --port 8000
# → http://localhost:8000/api/health

# Frontend (new terminal)
cd web
npm install
NEXT_PUBLIC_API_BASE=http://localhost:8000 npm run dev
# → http://localhost:3000

# iMessage orchestrator (macOS only, optional)
cd api/imessage
npm install
node spectrum_loop.mjs

# Regenerate product imagery (Apple Silicon, optional)
cd image-gen
uv venv --python 3.11 .venv
uv pip install -r requirements.txt
uv run python generate_images.py --all --skip-existing
```

See [`image-gen/README.md`](./image-gen/README.md) for SDXL model presets, seed comparison, and the full flag matrix.

---

## Deployment

### Backend → Cloud Run

```bash
cd api

# Build + push image
gcloud builds submit \
  --tag us-central1-docker.pkg.dev/theta-bliss-486220-s1/flanner/api:latest \
  --project=theta-bliss-486220-s1

# Deploy (subsequent env-only changes: `gcloud run services update`)
gcloud run deploy flanner-api \
  --image=us-central1-docker.pkg.dev/theta-bliss-486220-s1/flanner/api:latest \
  --region=us-central1 \
  --allow-unauthenticated \
  --env-vars-file=/path/to/env.yaml \
  --memory=1Gi --cpu=1 --timeout=300 \
  --min-instances=0 --max-instances=3 \
  --project=theta-bliss-486220-s1
```

Custom domain (one-time setup):

```bash
gcloud beta run domain-mappings create \
  --service=flanner-api \
  --domain=api.flanner.health \
  --region=us-central1 \
  --project=theta-bliss-486220-s1
# Prerequisites:
#  - api.flanner.health CNAME → ghs.googlehosted.com
#  - Google Search Console ownership verification for flanner.health
```

### Frontend → Vercel

```bash
cd web
vercel link --yes --project flanner-web

# Inject env
printf "$K2_API_KEY"        | vercel env add K2_API_KEY         production
printf "$K2_BASE_URL"       | vercel env add K2_BASE_URL        production
printf "$K2_MODEL"          | vercel env add K2_MODEL           production
printf "$GEMINI_API_KEY"    | vercel env add GEMINI_API_KEY     production
printf "https://flanner-api-318799600047.us-central1.run.app" \
                            | vercel env add NEXT_PUBLIC_API_BASE     production
printf "leftoverlogic-dev-user-001" \
                            | vercel env add NEXT_PUBLIC_DEMO_USER_ID production

vercel --prod --yes
```

Custom domains `flanner.health` + `www.flanner.health` are attached to the
`flanner-web` Vercel project and served via Vercel's recommended A / CNAME
records (see [DNS](#dns-porkbun)).

---

## Knot integration (production)

| Flow | Endpoint | Purpose |
|------|----------|---------|
| **TransactionLink** | `POST /session/create` → Web SDK | OAuth into DoorDash / Uber Eats / Grubhub to pull 6-month delivery history |
| **AgenticShopping** | `POST /cart` → merchant 44 (Amazon) | Add curated ASINs to a real Amazon Fresh cart |
| **Checkout** *(stubbed)* | `POST /cart/checkout` with `simulate=failed` | ⚠️ intentionally stubbed — no real-checkout function exists |
| **Webhooks** | `POST /knot` on Cloud Run | Receive `AUTHENTICATED`, `SYNC_CART_SUCCEEDED`, `CHECKOUT_*`, `ACCOUNT_LOGIN_REQUIRED`, … |

Mode switching is driven by a single env var:

```bash
KNOT_MODE=dev    # sandbox data, fake users (default)
KNOT_MODE=prod   # real merchant accounts, real Amazon cart
```

The [`flanner/knot.py`](./api/flanner/knot.py) wrapper normalizes dev vs.
prod response shape (`{merchants: [...]}` vs. flat `[...]`).

Full feasibility report & demo safety runbook:
**[`docs/runbooks/knot-prod.md`](./docs/runbooks/knot-prod.md)** — what
changes between dev and prod, what Knot does *not* offer, and the
step-by-step demo script with cleanup procedures.

---

## Core flows

### Plan generation — `POST /api/plans/generate`

```
body: { feedback_history: string[], space_id?: string }

→ flanner.plan.generate(...):
    1. Load last-30-days transactions from Mongo
    2. Load pantry + Amazon Fresh catalog
    3. Load upcoming Google Calendar events (if OAuth-linked)
    4. Load adherence rollup (last 7 days)
    5. Build K2 prompt (context + dietary constraints + feedback)
    6. Stream K2 response → parse JSON → validate schema
    7. Persist to `plans` collection, return plan_id
```

### Cart push — `POST /api/plans/{plan_id}/order`

```
→ flanner.plan.place_order(plan):
    1. Select top-N items from plan.shopping_list
    2. Verify merchant 44 is OAuth-linked for this user_id
    3. POST /cart (prod) — items land in real Amazon Fresh cart
    4. POST /cart/checkout with simulate=failed (hard-coded)
    5. Log to cart_operations collection
    6. Return { ordered_items, skipped_items, total_cost }
```

### Photo recognition — `POST /api/photo`

```
body: { image_base64, mime_type?, space_id? }

→ flanner.vision.analyze(image_bytes):
    1. Call Gemma (AI Studio) with classification prompt
       → kind: "food" | "receipt" | "unclear"
    2. If food:    extract dish_name, portions, kcal → log adherence
    3. If receipt: parse line items → pantry deltas
    4. Persist to photo_logs with audit trail
```

### Daily check-in — `POST /api/checkin`

```
body: { reply, meal_title?, day?, space_id? }

→ flanner.checkin.record_reply(...):
    1. Keyword fast-path (~90% of replies)
    2. Fallback: Gemma classify cooked | delivery | skipped | unclear
    3. Persist to adherence collection with plan_id + day
    4. Feed into next plan's feedback_history
```

---

## Hackathon context

- **Event**: HackPrinceton Spring 2026 · Princeton University · Apr 17–19, 2026
- **Submission**: 2026-04-19 08:00 ET
- **Judging**: 2026-04-19 09:30–14:00 ET
- **Primary track**: 🏥 **Healthcare** — delivery-driven diet → home-cooked swap for measurable sodium / calorie / protein impact
- **Sponsor tracks targeted**:
  - 🪢 **Knot** ($500) — production-grade delivery + cart integration
  - 📨 **Photon** ($400 + $400 credits) — real iMessage orchestration via spectrum-ts

---

## Credits

| | Provider | Role |
|-|----------|------|
| 🧠 | **K2 Think V2** — MBZUAI Institute of Foundation Models | Weekly plan reasoning |
| 👁 | **Gemma 4 / 3** via Google AI Studio | Vision + check-in classifier |
| 🛒 | **Knot API** | Transaction + cart hand-off to Amazon Fresh |
| 📱 | **Photon** (`spectrum-ts`, `@photon-ai/imessage-kit`) | Live iMessage orchestration |
| ☁️ | **Google Cloud Run · Artifact Registry · Calendar API** | Backend hosting + OAuth |
| 🍃 | **MongoDB Atlas** | Database cluster |
| ▲ | **Vercel** | Frontend hosting + custom domain |
| 🌳 | **Rainforest API** | Real Amazon ASIN discovery |
| 🖼 | **Stable Diffusion XL** · Playground · Dreamshaper | Product imagery |

---

<div align="center">

**Product name: Flanner** · Python package: `flanner` · Repo codename: `hackprinceton-beta`

Made with charcoal outlines, peach gradients, and many espressos at Princeton.

</div>
