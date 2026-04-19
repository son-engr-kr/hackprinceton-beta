# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project context

HackPrinceton Spring 2026 **Knot track** submission. Product name is **"Flanner"** (domain **flanner.health**). UI tagline: "a mirror on your delivery habits". Repo/codename is still `ande` (not renamed); Python backend package lives at `api/flanner/`. The app takes ~6 months of delivery-food records → auto-derives ingredients → assembles a grocery cart → proposes a weekly meal plan with healthier home-cooked swaps.

**Mock-only contract.** The entire demo is a fully-mocked frontend — no real Knot / SMS / DoorDash / Amazon Fresh / Google Calendar integrations exist. Anything touching `web/` stays mocked unless the user explicitly asks otherwise. Extend existing routes/sections rather than adding real API wiring.

## Repository layout

Two independent sub-projects with different toolchains:

- **`web/`** — Next.js 15 + React 19 + Tailwind 3 + Framer Motion 11 + Zustand 5 (with `persist`). Demo UI.
- **`image-gen/`** — Python 3.11 SDXL pipeline. Produces `images/<category>/<key>.png` assets consumed by `web`.
- `ande/` — initial idea docs (Korean).
- `brainstorming/` — hackathon packet, sponsor strategy notes (read-only reference).
- `memory/` — Claude Code persistent memory (see also the user's global memory loader).

`web/public/images` is a **symlink** to `../../image-gen/images`. Regenerating an asset updates the app immediately. If an image is missing, `AssetImage` falls back to an emoji glyph — the app stays demoable without any images present.

## Commands

### web (from `web/`)

```bash
npm install
npm run dev         # http://localhost:3000
npm run build
npm run start
npm run lint        # next lint (eslint-config-next)
npm run typecheck   # tsc --noEmit
```

There is no test suite.

### image-gen (from `image-gen/`)

**Use `uv` exclusively.** Never `source .venv/bin/activate`, never system `pip`, never `pipx`/`conda`. `uv run` auto-resolves the venv.

```bash
uv venv --python 3.11 .venv
uv pip install -r requirements.txt

uv run python generate_images.py --all --skip-existing       # everything, resumable
uv run python generate_images.py --all --category food       # one category
uv run python generate_images.py --item burger --seeds 3     # one item, 3 variants
uv run python generate_images.py --all --model playground    # alt model preset
```

See `image-gen/README.md` for the full flag matrix and model presets.

**Filename policy**: canonical path the app reads is `images/<category>/<key>.png` (default model, single seed, realistic style). Non-default models or multi-seed runs get tagged suffixes like `{key}__{model}_seed{N}.png` or `{key}__cartoon.png` — promote a winner by `mv`ing it to the canonical path.

**MPS fp16 caveat**: the script auto-downgrades `--dtype fp16` → `fp32` on Apple Silicon. SDXL UNet attention produces NaN in fp16 on MPS regardless of VAE precision — that's the all-black/all-white failure mode. Don't override it on Mac.

## Architecture — web

**App-router route group.** `app/(app)/` contains every authenticated screen (`/`, `/plan`, `/cart`, `/chat`, `/history`, `/impact`, `/settings`), all wrapped by `app/(app)/layout.tsx` which mounts `<Sidebar>` + `<OnboardingGate>`. `app/onboarding/page.tsx` lives outside the group so the gate can redirect to it without recursing.

**Onboarding gate.** `components/OnboardingGate.tsx` waits for Zustand's `persist` to hydrate (tracked with a local `hydrated` state), then redirects to `/onboarding` if `onboardingComplete` is false. Do not read persisted store state before hydration — SSR and first paint will mismatch. This hydration pattern is the reason the gate renders `null` / a loader before rendering children.

**Global store** (`lib/store.ts`). Single Zustand store with `persist` middleware. Keys persisted: `onboardingComplete`, `goal`, `dietary`, `planStatus`, `cartStatus`, `eatenRecipeKeys`, `planModel`. Transient keys (`reasoningIndex`, `mascotPose`) are explicitly excluded from `partialize`. Storage key is `"ande-store"`.

**Mock data layer** (`lib/mock/`). All derived views are pure functions over seeded mock arrays; `TODAY` is pinned to `2026-04-18` so demos are deterministic. `delivery-history.ts` uses a seeded `mulberry32(42)` PRNG to generate ~6 months of orders from a fixed distribution → `topFoods()`, `totalSpent()`, `recordsInLastDays()`, `totalSodium()`, `topRestaurants()`. `recipes.ts` exports `weeklyPlan()` + `weeklyCart()`. Ingredient aggregation and cart assembly live in these modules — keep business logic there, not in pages.

**AssetImage** (`components/AssetImage.tsx`). The canonical way to render any generated PNG. Always pass both `name` (the image key) and `emoji` (the fallback). Categories are `"food" | "ingredient" | "mascot" | "meal"`.

**Aesthetic contract** (user is explicit about this):
- Palette: cream `#FFF5EC`, peach `#FFE5D9/#FFB4A2`, charcoal `#4A3F45`, hotpink `#FF477E` (CTA), mint `#B5E48C`, lavender `#D6C8FF`, sunny `#FFD166`.
- "Sticker" look: 3px charcoal outlines via the `.chunky` utility, chunky `.sticker` cards for highlights, lighter `.tile` for dashboard cards (both defined in `app/globals.css`).
- Korean UI copy throughout. Font is **Pretendard Variable** loaded from a CDN `<link>` in `app/layout.tsx`.
- Motion: spring transitions (stiffness 140–220, damping 12–18) with 40–80ms stagger. Avoid fade-only — entrances should have a spring-y `y` or `scale` component.

**Path alias**: `@/*` → repo root of `web/` (see `tsconfig.json`).

## Architecture — image-gen

Single script `generate_images.py` driven by `prompts.yaml`. `prompts.yaml` has three top-level keys: `negative` (shared negative prompt), `styles` (style suffixes, applied to food/ingredient/meal; mascot bypasses and uses its own chibi prompt), and `categories` (item prompts, style-agnostic). Adding a new item = adding a key under the right `categories.<cat>.items` block; the generator picks it up automatically.

**All presets (sdxl / playground / sdxl-turbo / dreamshaper) use `StableDiffusionXLPipeline`** so they're drop-in. Preset differences: `model_id`, default steps, default CFG, native resolution, whether fp16 weights exist.

## Conventions

- **Language**: Korean for conversational replies and UI copy; English for code, identifiers, file paths, tool output. The user writes in Korean and expects Korean back.
- **Structured config → YAML, not markdown tables.** YAML handles nesting and folded multi-line strings; markdown tables are brittle.
- **Mock-only**: do not add real third-party API calls to `web/` unless explicitly requested.
- **Symlink, don't copy** images between `image-gen/` and `web/public/`.
- The `plan*.md` files at the repo root are gitignored (user scratchpads) — leave them alone.
