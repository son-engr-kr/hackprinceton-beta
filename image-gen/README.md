# image-gen

SDXL-based image generator for the **web** mock. Runs on **Apple Silicon (MPS)**,
CUDA, or CPU — no TRELLIS / CUDA extensions required.

Produces 2D PNGs (with transparent background via `rembg` by default) under
`images/<category>/<key>.png`. Copy or symlink into `web/public/images/`.

---

## Quickstart

```bash
cd image-gen
uv venv --python 3.11 .venv
uv pip install -r requirements.txt

uv run uv run python generate_images.py --all --skip-existing
```

First run downloads SDXL (~6.5 GB) and the rembg U²-Net model (~170 MB) into
`~/.cache/huggingface/` and `~/.u2net/`.

---

## Usage

**Recommended full-batch command** (juggernaut — only model that survived the burger+pizza shootout across realistic and cartoon styles):

```bash
uv run python generate_images.py --all --model juggernaut --seeds 2 --skip-existing
```

Other examples:

```bash
uv run python generate_images.py --all                            # everything in prompts.yaml
uv run python generate_images.py --all --category food            # just the 16 food icons
uv run python generate_images.py --all --category ingredient      # the ~36 ingredients
uv run python generate_images.py --all --category mascot          # 6 mascot poses
uv run python generate_images.py --all --category meal            # home-cooked meal cards
uv run python generate_images.py --item burger                    # one item
uv run python generate_images.py --all --seeds 3                  # 3 seed variants each
uv run python generate_images.py --all --skip-existing            # resume after a crash
uv run python generate_images.py --all --no-rembg                 # skip alpha cutout
```

Edit `prompts.yaml` to change / add prompts. New keys are picked up automatically.

---

## Model presets

Pass `--model <name>` to switch. All presets use `StableDiffusionXLPipeline` so
they're drop-in — only `model_id`, recommended steps/guidance, and native size
differ.

| `--model`      | HF repo                                                  | Default steps · CFG · size | Notes                                        |
|----------------|----------------------------------------------------------|----------------------------|----------------------------------------------|
| `sdxl` (def.)  | `stabilityai/stable-diffusion-xl-base-1.0`               | 25 · 7.5 · 768             | Balanced default                             |
| `juggernaut`   | `RunDiffusion/Juggernaut-XL-v9`                          | 25 · 6.0 · 1024            | Versatile SDXL fine-tune — only survivor in both realistic + cartoon |
| `realvis`      | `SG161222/RealVisXL_V4.0`                                | 25 · 5.0 · 1024            | Photorealism-focused (realistic only)        |
| `playground`   | `playgroundai/playground-v2.5-1024px-aesthetic`          | 30 · 3.0 · 1024            | Aesthetic tune — great for stylized illus.   |
| `sdxl-turbo`   | `stabilityai/sdxl-turbo`                                 | 4 · 0.0 · 512              | 1–4 step inference, very fast                |
| `dreamshaper`  | `Lykon/dreamshaper-xl-v2-turbo`                          | 6 · 2.0 · 1024             | Cartoon / illustration community fine-tune   |

Your `--steps`, `--guidance`, `--width`, `--height` flags override the preset.

```bash
uv run python generate_images.py --all --model playground                   # aesthetic
uv run python generate_images.py --all --model sdxl-turbo --steps 2         # fastest
uv run python generate_images.py --all --model dreamshaper                  # cartoon
uv run python generate_images.py --item burger --model playground --seeds 3 # compare
```

> First run of a new model downloads ~6.5 GB. Cached in `~/.cache/huggingface/`.

---

## Performance

| Hardware             | dtype | ~time / image @ 25 steps |
|----------------------|-------|--------------------------|
| M1 Pro, 16 GB        | fp32  | ~90 s                    |
| M2 / M3 Max          | fp32  | ~40 s                    |
| M4 / M5 Pro          | fp32  | ~25 s                    |
| RTX 3080 / 4070      | fp16  | ~4 s                     |

**MPS forces fp32.** SDXL's UNet attention produces NaN in fp16 on MPS (all
outputs come out black/white), regardless of VAE. The script auto-downgrades
`--dtype fp16` → `fp32` on MPS with a warning. fp16 works on CUDA where it's
~2–3× faster.

---

## Output layout

```
images/
├── food/           burger.png, pizza.png, sushi.png, ...
├── ingredient/     tomato.png, onion.png, garlic.png, ...
├── mascot/         mascot_wave.png, mascot_jump.png, ...
└── meal/           chicken_salad.png, salmon_bowl.png, ...
```

To use them in `web`:

```bash
# Option A: symlink (recommended — regenerating updates the app immediately)
ln -s ../../image-gen/images ../web/public/images

# Option B: copy
mkdir -p ../web/public/images
cp -R images/* ../web/public/images/
```

---

## Flags

| Flag               | Default | Notes                                      |
|--------------------|---------|--------------------------------------------|
| `--device`         | auto    | `mps` / `cuda` / `cpu` / `auto`            |
| `--dtype`          | auto    | `fp16` on CUDA, `fp32` elsewhere           |
| `--width --height` | 768     | SDXL needs ≥768 for coherent output        |
| `--steps`          | 25      | Lower → faster, less refined               |
| `--guidance`       | 7.5     | How strictly to follow the prompt          |
| `--seeds`          | 1       | Number of variations per prompt            |
| `--no-rembg`       | —       | Keep raw SDXL output (white background)    |
| `--no-pad`         | —       | Skip square-padding normalization          |
| `--padding`        | 0.08    | Transparent margin per edge (fraction of canvas side) |
| `--canvas-size`    | auto    | Output square side in px. Default: `max(width, height)` |

---

## Troubleshooting

| Issue | Fix |
|-------|-----|
| `RuntimeError: Placeholder storage has not been allocated on MPS device` | Your PyTorch is <2.4. Upgrade: `uv pip install --upgrade torch torchvision`. |
| Black / NaN output on M1 with fp16 | Switch to `--dtype fp32`. |
| `rembg` first-run download hangs | Pre-download manually: `python -c "from rembg import new_session; new_session()"`. |
| `OSError: ... variant=fp16 not found` | Run without `--dtype fp16` — the fp16 weights variant only loads with fp16 dtype. |
