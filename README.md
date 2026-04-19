# ande (Knot track)

HackPrinceton Spring 2026 — **Knot** sponsor track submission.

Mock demo app: take 30 days of delivery-food records → auto-derive ingredients →
assemble a grocery cart → propose a weekly meal plan with healthier home-cooked
swaps → show calorie/macro delta + money saved.

**Current state**: fully-mocked frontend (no real Knot / SMS / grocery
integrations). Six-scene button-driven experience with element-flying
animations. Image assets generated locally via SDXL on Apple Silicon.

## Structure

```
.
├── ande/                ← initial idea (Korean)
├── ande-app/            ← frontend (Next.js 15 + React 19 + Framer Motion)
├── ande-image-gen/      ← SDXL / Playground image pipeline (Apple Silicon)
├── brainstorming/       ← hackathon packet, sponsor strategy, cheatsheets
└── memory/              ← Claude Code project memory
```

```
ande-app/
├── app/                             ← Next.js app router
│   ├── page.tsx                     ← experience shell (scene state machine)
│   ├── layout.tsx
│   └── globals.css                  ← tailwind + palette
├── components/
│   ├── Mascot.tsx                   ← "Motji" — scene-aware fixed mascot
│   ├── AssetImage.tsx               ← generated PNG with emoji fallback
│   └── experience/
│       ├── NextButton.tsx
│       ├── Scene0Intro.tsx          ← hero
│       ├── Scene1Review.tsx         ← monthly delivery review
│       ├── Scene2Breakdown.tsx      ← CORE: auto-cascading ingredient burst
│       ├── Scene3Cart.tsx           ← grocery cart morph
│       ├── Scene4Plan.tsx           ← weekly meal plan
│       └── Scene5Stats.tsx          ← health + savings finale
├── lib/
│   ├── store.ts                     ← zustand: mascot pose, scene, eaten meals
│   ├── utils.ts
│   └── mock/
│       ├── delivery-history.ts      ← 30 delivery records (2026-03-19→04-18)
│       ├── foods.ts                 ← delivery-food catalog + macros
│       ├── ingredients.ts           ← 37 ingredients (pricing)
│       └── recipes.ts               ← 7 weekly-plan recipes
└── public/images → ../../ande-image-gen/images   (symlink)

ande-image-gen/
├── prompts.yaml                     ← food, ingredient, mascot, meal prompts
├── generate_images.py               ← SDXL/Playground/Turbo/Dreamshaper
├── requirements.txt
└── images/                          ← generated PNGs (gitignored)
```

## Prerequisites

- **Node.js 20+** (for ande-app). `brew install node`
- **Python 3.11** + **uv** (for ande-image-gen). `brew install uv`

## Quickstart: ande-app

```bash
cd ande-app
npm install
npm run dev     # → http://localhost:3000
```

Navigate with **`Next` button** (bottom-right) or **`Space` / `→`** key.
`←` goes back. Scene progress dots sit at the top.

If images haven't been generated yet the app falls back to emoji — still demoable.

## Quickstart: ande-image-gen

```bash
cd ande-image-gen
uv venv --python 3.11 .venv
uv pip install -r requirements.txt

uv run python generate_images.py --all --skip-existing
```

First run downloads SDXL (~6.5 GB) + rembg U²-Net (~170 MB) into
`~/.cache/huggingface/` and `~/.u2net/`. Subsequent runs are cached.

Once generated, symlink into the app:

```bash
cd ../ande-app
ln -sfn ../ande-image-gen/images public/images
```

## Model presets

Pass `--model <name>` to switch. All presets use `StableDiffusionXLPipeline`
(drop-in). Your `--steps`, `--guidance`, `--width`, `--height` override the
preset defaults.

| `--model`      | HuggingFace repo                                         | Steps · CFG · size | Notes                                        |
|----------------|----------------------------------------------------------|--------------------|----------------------------------------------|
| `sdxl` (def.)  | `stabilityai/stable-diffusion-xl-base-1.0`               | 25 · 7.5 · 768     | Balanced default                             |
| `playground`   | `playgroundai/playground-v2.5-1024px-aesthetic`          | 30 · 3.0 · 1024    | Aesthetic tune — best for stylized illus.    |
| `sdxl-turbo`   | `stabilityai/sdxl-turbo`                                 | 4 · 0.0 · 512      | 1–4 step inference, very fast                |
| `dreamshaper`  | `Lykon/dreamshaper-xl-v2-turbo`                          | 6 · 2.0 · 1024     | Cartoon / illustration fine-tune             |

**Filename policy** (avoids collision when comparing models):

- Default model + single seed → `{key}.png` (canonical path the app reads)
- Non-default model OR `--seeds N>1` → `{key}__{model}_seed{N}.png` (for compare)

## Styles

Food, ingredient, and meal items render in both **realistic** (product photograph,
45° angle, studio lighting) and **cartoon** (vector illustration, 45° angle, flat
shading) by default. Mascot items ignore the style and use their own chibi prompt.

| `--style`   | Filename                          | Description                       |
|-------------|-----------------------------------|-----------------------------------|
| `both` (def.) | writes both files per item       | realistic + cartoon in one run    |
| `realistic` | `{key}.png`                       | canonical app path                |
| `cartoon`   | `{key}__cartoon.png`              | tagged; mv to canonical if preferred |

## Common commands

```bash
# Everything, both styles (realistic + cartoon), default sdxl
uv run python generate_images.py --all --skip-existing

# Realistic only (canonical filenames, faster — half the work)
uv run python generate_images.py --all --style realistic

# Cartoon only (writes to burger__cartoon.png etc)
uv run python generate_images.py --all --style cartoon

# Single category only
uv run python generate_images.py --all --category food
uv run python generate_images.py --all --category ingredient
uv run python generate_images.py --all --category mascot
uv run python generate_images.py --all --category meal

# Single item, multiple seeds for comparison (both styles each seed)
uv run python generate_images.py --item burger --seeds 5 --seed-start 500

# Switch model — great for problem items
uv run python generate_images.py --item cilantro --model playground
uv run python generate_images.py --item fried_chicken --model dreamshaper

# Full sweep: every item × every model × both styles × 2 seeds
#   4 models × 66 items × 2 styles × 2 seeds = ~1000 images (ouch)
#   on M5 Pro fp32: plan ~12 hours — run overnight, or narrow it down
for m in sdxl playground sdxl-turbo dreamshaper; do
  uv run python generate_images.py --all --model $m --seeds 2 --seed-start 500
done

# Quick compare: every item × every model × realistic only × 1 seed (264 images)
for m in sdxl playground sdxl-turbo dreamshaper; do
  uv run python generate_images.py --all --model $m --style realistic --seeds 1 --seed-start 500
done

# Turbo preview to scout prompts fast (both styles, 1 seed, ~13 min)
uv run python generate_images.py --all --model sdxl-turbo --seeds 1

# Promote a winner to the canonical app path
mv images/food/burger__cartoon.png images/food/burger.png               # swap cartoon to canonical
mv images/food/burger__playground_seed502.png images/food/burger.png    # swap seed+model winner
```

## Performance (M5 Pro, Apple Silicon)

| Model        | dtype | Time / image |
|--------------|-------|--------------|
| sdxl         | fp32  | ~25 s        |
| playground   | fp32  | ~50 s (1024) |
| sdxl-turbo   | fp32  | ~6 s  (512)  |
| dreamshaper  | fp32  | ~15 s (1024) |

**MPS forces fp32.** The SDXL UNet's attention layers produce NaN in fp16 on
MPS regardless of VAE precision — that's the all-black / all-white output.
The script auto-downgrades `--dtype fp16` → `fp32` with a warning on MPS.
fp16 still works on CUDA where it's ~2–3× faster.

## Flags

| Flag               | Default       | Notes                                       |
|--------------------|---------------|---------------------------------------------|
| `--all`            | —             | Every item in `prompts.yaml`                |
| `--item KEY`       | —             | Single item (mutually exclusive with `--all`) |
| `--category X`     | —             | Limit to food / ingredient / mascot / meal  |
| `--model NAME`     | `sdxl`        | See presets table above                     |
| `--seeds N`        | 1             | Variations per item                         |
| `--seed-start S`   | 42            | First seed (seeds are S, S+1, …)            |
| `--steps N`        | preset        | Sampler steps                               |
| `--guidance X`     | preset        | CFG scale                                   |
| `--width / --height` | preset      | Output resolution                           |
| `--skip-existing`  | —             | Skip items whose `{key}.png` exists         |
| `--no-rembg`       | —             | Keep white background (useful when rembg over-strips greens) |
| `--device`         | auto          | `mps` / `cuda` / `cpu`                      |
| `--dtype`          | auto          | `fp16` / `bf16` / `fp32`                    |

## Troubleshooting

| Symptom | Cause / fix |
|---------|-------------|
| All-white output on MPS | fp16 NaN — already patched via `sdxl-vae-fp16-fix`. If it still happens, drop `--dtype fp16` to use fp32. |
| Image is nearly empty after rembg (file <100 KB) | rembg U²-Net mis-stripped. Re-run with `--no-rembg` to see the raw SDXL output, or pick a different seed. Green herbs especially prone. |
| `OSError: variant=fp16 not found` | Model doesn't publish fp16 weights (e.g. `dreamshaper` preset has `fp16_variant=False`). Use `--dtype fp32` for that preset. |
| First run hangs on "Fetching 19 files" | HF download from an unauthenticated client is rate-limited. Set `HF_TOKEN` or just wait. |

---

## Hackathon reference

- **Event**: HackPrinceton Spring 2026 (April 17–19, 2026, Princeton University)
- **Submission**: 2026-04-19 8 AM
- **Judging**: 9:30 AM – 2 PM on 4/19
- **Target track**: Knot ($500, delivery heatmap fit)

See `brainstorming/S26_Sponsor_Strategy.md` for full track strategy.
