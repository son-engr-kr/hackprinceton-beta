"""
image-gen/generate_images.py

Generate 2D reference images for the web mock using Stable Diffusion XL.
Runs on Apple Silicon (MPS), CUDA, or CPU — device auto-detected.

Output: images/<category>/<key>.png

Usage:
    cd image-gen
    uv venv --python 3.11 .venv
    uv pip install -r requirements.txt

    uv run python generate_images.py --all                          # every item, both styles
    uv run python generate_images.py --all --style realistic        # realistic only (canonical filenames)
    uv run python generate_images.py --all --style cartoon          # cartoon only (tagged filenames)
    uv run python generate_images.py --all --category food          # food only
    uv run python generate_images.py --item burger                  # single item
    uv run python generate_images.py --all --seeds 3                # 3 variations per item
    uv run python generate_images.py --all --skip-existing
    uv run python generate_images.py --all --no-rembg               # keep white background

    # Model selection (defaults: sdxl):
    uv run python generate_images.py --all --model playground       # aesthetic tune
    uv run python generate_images.py --all --model sdxl-turbo       # 1-4 steps, 512px
    uv run python generate_images.py --all --model dreamshaper      # cartoon tune

First run downloads SDXL (~6.5 GB) + rembg U2Net (~170 MB). Cached afterwards.
"""

import argparse
import sys
from pathlib import Path

import yaml


SCRIPT_DIR = Path(__file__).resolve().parent
PROMPTS_FILE = SCRIPT_DIR / "prompts.yaml"
IMAGES_DIR = SCRIPT_DIR / "images"


# ── Model presets ────────────────────────────────────────────────────────────
# All presets use the same StableDiffusionXLPipeline so they're drop-in.
# `steps` / `guidance` / `size` are the preset's recommended defaults — user
# CLI flags (--steps / --guidance / --width / --height) override if supplied.

MODEL_PRESETS: dict[str, dict] = {
    "sdxl": {
        "model_id": "stabilityai/stable-diffusion-xl-base-1.0",
        "steps": 25,
        "guidance": 7.5,
        "fp16_variant": True,
        "size": 768,
        "note": "Stable Diffusion XL base — balanced default.",
    },
    "playground": {
        "model_id": "playgroundai/playground-v2.5-1024px-aesthetic",
        "steps": 30,
        "guidance": 3.0,
        "fp16_variant": True,
        "size": 1024,
        "note": "Playground v2.5 — aesthetic tune, great for stylized illustration.",
    },
    "sdxl-turbo": {
        "model_id": "stabilityai/sdxl-turbo",
        "steps": 4,
        "guidance": 0.0,
        "fp16_variant": True,
        "size": 512,
        "note": "SDXL Turbo — 1-4 step inference at 512px. Very fast.",
    },
    "dreamshaper": {
        "model_id": "Lykon/dreamshaper-xl-v2-turbo",
        "steps": 6,
        "guidance": 2.0,
        "fp16_variant": False,
        "size": 1024,
        "note": "Dreamshaper XL Turbo — cartoon/illustration community fine-tune.",
    },
    "juggernaut": {
        "model_id": "RunDiffusion/Juggernaut-XL-v9",
        "steps": 25,
        "guidance": 6.0,
        "fp16_variant": True,
        "size": 1024,
        "note": "Juggernaut XL v9 — versatile SDXL fine-tune (photo + illustration).",
    },
    "realvis": {
        "model_id": "SG161222/RealVisXL_V4.0",
        "steps": 25,
        "guidance": 5.0,
        "fp16_variant": True,
        "size": 1024,
        "note": "RealVisXL V4.0 — photorealism-focused SDXL fine-tune.",
    },
}
DEFAULT_MODEL = "sdxl"


# ── Device / dtype detection ─────────────────────────────────────────────────

def detect_device() -> str:
    import torch
    if torch.backends.mps.is_available():
        return "mps"
    if torch.cuda.is_available():
        return "cuda"
    return "cpu"


def default_dtype_for(device: str) -> str:
    # fp16 is reliable on CUDA. On MPS, fp16 works on M2+ but is flaky on M1
    # (intermittent black output, attention NaNs). fp32 is the safe default.
    return "fp16" if device == "cuda" else "fp32"


# ── Prompt loading ───────────────────────────────────────────────────────────

def load_prompts(path: Path = PROMPTS_FILE) -> dict:
    assert path.exists(), f"prompts file not found: {path}"
    with path.open(encoding="utf-8") as f:
        data = yaml.safe_load(f)
    assert "categories" in data, f"{path.name} must have a 'categories' key"
    # Tolerate either new schema (styles/negative at top level) or old (style dict).
    if "styles" not in data:
        data["styles"] = {}
    if "negative" not in data:
        data["negative"] = data.get("style", {}).get("negative", "")
    return data


def flatten_items(
    data: dict, category_filter: str | None = None
) -> list[tuple[str, str, str, bool]]:
    """
    Return list of (category, key, prompt, apply_style).
    YAML folded '>' strings are collapsed to a single line.
    apply_style=False when the category sets `apply_style: false` (e.g. mascot),
    meaning style suffixes should not be appended.
    """
    out = []
    for cat, cat_data in data["categories"].items():
        if category_filter and cat != category_filter:
            continue
        apply_style = cat_data.get("apply_style", True)
        for key, prompt in cat_data.get("items", {}).items():
            out.append((cat, key, " ".join(prompt.split()), apply_style))
    return out


def resolve_prompt(base: str, style_name: str, styles: dict) -> str:
    """Compose a final prompt: <base>, <style suffix>. style_name='none' → just base."""
    if style_name == "none":
        return base
    suffix = " ".join(styles.get(style_name, "").split())
    if not suffix:
        return base
    # Avoid double comma if base already ends with one
    joiner = "" if base.rstrip().endswith(",") else ", "
    return f"{base}{joiner}{suffix}"


# ── Pipeline ─────────────────────────────────────────────────────────────────

def load_pipeline(model_name: str, preset: dict, device: str, dtype_name: str):
    import torch
    from diffusers import StableDiffusionXLPipeline, AutoencoderKL

    model_id = preset["model_id"]
    dtype = {"fp16": torch.float16, "bf16": torch.bfloat16, "fp32": torch.float32}[dtype_name]
    print(f"[images] Loading {model_name} ({model_id})  device={device}  dtype={dtype_name} ...")

    kwargs = dict(torch_dtype=dtype, use_safetensors=True)
    # fp16 safetensor variant only exists for models that publish one, and only
    # loadable with fp16 dtype. Other dtypes get default weights.
    if dtype == torch.float16 and preset.get("fp16_variant", False):
        kwargs["variant"] = "fp16"

    pipe = StableDiffusionXLPipeline.from_pretrained(model_id, **kwargs)

    # SDXL's stock VAE produces NaN in fp16 on MPS (all-white output). Swap to
    # madebyollin's fp16-retrained VAE whenever we run fp16. Also silences the
    # `upcast_vae` FutureWarning since we no longer rely on auto-upcast.
    if dtype == torch.float16:
        print(f"[images] Swapping in sdxl-vae-fp16-fix for {model_name} ...")
        pipe.vae = AutoencoderKL.from_pretrained(
            "madebyollin/sdxl-vae-fp16-fix",
            torch_dtype=torch.float16,
        )
        pipe.vae.config.force_upcast = False

    pipe.to(device)

    # Memory optimizations — unified memory on Mac fills up fast.
    pipe.enable_vae_slicing()
    pipe.enable_attention_slicing()

    # Progress bar is noisy across many items; silence per-step updates.
    pipe.set_progress_bar_config(disable=True)

    print(f"[images] {model_name} ready.")
    return pipe


def make_generator(seed: int):
    """
    CPU generator for reproducibility portability — manual_seed on MPS
    generators has inconsistent behavior across PyTorch versions.
    """
    import torch
    return torch.Generator("cpu").manual_seed(seed)


def run_rembg(img):
    from rembg import remove
    return remove(img)


def pad_to_square(img, canvas_size: int, padding_ratio: float):
    """
    Normalize an RGBA image so every output has identical size and margins:
      1. Trim the transparent border via alpha bbox.
      2. Scale the subject (aspect-preserving) so its longer side equals
         canvas_size * (1 - 2 * padding_ratio).
      3. Paste centered onto a canvas_size x canvas_size fully-transparent
         canvas.

    Requires an RGBA image with a meaningful alpha channel (i.e. post-rembg).
    """
    from PIL import Image
    assert 0.0 <= padding_ratio < 0.5, f"padding_ratio must be in [0, 0.5): {padding_ratio}"
    assert canvas_size > 0, f"canvas_size must be positive: {canvas_size}"

    if img.mode != "RGBA":
        img = img.convert("RGBA")

    bbox = img.getchannel("A").getbbox()
    if bbox is None:
        return Image.new("RGBA", (canvas_size, canvas_size), (0, 0, 0, 0))

    content = img.crop(bbox)
    cw, ch = content.size
    target_long = max(1, int(round(canvas_size * (1.0 - 2.0 * padding_ratio))))
    scale = target_long / max(cw, ch)
    new_w = max(1, int(round(cw * scale)))
    new_h = max(1, int(round(ch * scale)))
    content = content.resize((new_w, new_h), Image.LANCZOS)

    canvas = Image.new("RGBA", (canvas_size, canvas_size), (0, 0, 0, 0))
    ox = (canvas_size - new_w) // 2
    oy = (canvas_size - new_h) // 2
    canvas.paste(content, (ox, oy), content)
    return canvas


def generate_one(
    pipe,
    images_dir: Path,
    category: str,
    key: str,
    filename: str,
    full_prompt: str,
    negative: str,
    seed: int,
    width: int,
    height: int,
    steps: int,
    guidance: float,
    use_rembg: bool,
    use_pad: bool,
    padding_ratio: float,
    canvas_size: int,
) -> Path:
    out_dir = images_dir / category
    out_dir.mkdir(parents=True, exist_ok=True)
    out_path = out_dir / f"{filename}.png"

    import time
    print(f"  {category}/{filename}  seed={seed} ...", end=" ", flush=True)
    generator = make_generator(seed)
    t0 = time.perf_counter()
    result = pipe(
        prompt=full_prompt,
        negative_prompt=negative,
        width=width,
        height=height,
        num_inference_steps=steps,
        guidance_scale=guidance,
        generator=generator,
    )
    t_diff = time.perf_counter() - t0
    img = result.images[0]
    t1 = time.perf_counter()
    if use_rembg:
        img = run_rembg(img)
    t_rembg = time.perf_counter() - t1
    t2 = time.perf_counter()
    # Padding requires an alpha channel — only meaningful post-rembg.
    if use_pad and use_rembg:
        img = pad_to_square(img, canvas_size=canvas_size, padding_ratio=padding_ratio)
    t_pad = time.perf_counter() - t2
    img.save(out_path)
    total = t_diff + t_rembg + t_pad
    try:
        display = out_path.relative_to(SCRIPT_DIR)
    except ValueError:
        display = out_path
    print(f"-> {display}  "
          f"[{total:.1f}s  diff={t_diff:.1f}s  rembg={t_rembg:.1f}s  pad={t_pad:.2f}s]")
    return out_path


# ── CLI ──────────────────────────────────────────────────────────────────────

def parse_args():
    p = argparse.ArgumentParser(
        description="SDXL image generator for web (Apple Silicon / CUDA / CPU)."
    )
    target = p.add_mutually_exclusive_group(required=True)
    target.add_argument("--all", action="store_true")
    target.add_argument("--item", metavar="KEY",
                        help="Single item key (validated against the loaded prompts file).")

    p.add_argument("--category",
                   help="Limit --all to one category (validated against the loaded prompts file).")
    p.add_argument("--seeds", type=int, default=1,
                   help="Variations per item (default 1).")
    p.add_argument("--seed-start", type=int, default=42)
    p.add_argument("--skip-existing", action="store_true",
                   help="Skip items whose PNG already exists.")
    # Model / size / sampler — all default to None so the chosen --model's
    # preset provides sensible defaults; user flags override.
    p.add_argument("--model", default=DEFAULT_MODEL,
                   help=f"Model name, comma-separated list, or 'all'. "
                        f"Options: {', '.join(MODEL_PRESETS.keys())}. "
                        f"Default: {DEFAULT_MODEL}. Multiple models reload the pipeline in between.")
    p.add_argument("--style", choices=["realistic", "cartoon", "both"], default="both",
                   help="Style suffix to apply to food/ingredient/meal prompts. "
                        "Mascot ignores this. Default: both.")
    p.add_argument("--width", type=int, default=None)
    p.add_argument("--height", type=int, default=None)
    p.add_argument("--steps", type=int, default=None)
    p.add_argument("--guidance", type=float, default=None)
    p.add_argument("--no-rembg", action="store_true",
                   help="Skip background removal (keep the raw output as-is).")
    p.add_argument("--no-pad", action="store_true",
                   help="Skip square-padding normalization (keep rembg output as-is).")
    p.add_argument("--padding", type=float, default=0.08,
                   help="Transparent margin as a fraction of canvas side per edge (default 0.08).")
    p.add_argument("--canvas-size", type=int, default=None,
                   help="Square canvas side in pixels after padding. Default: max(width, height).")
    p.add_argument("--device", choices=["mps", "cuda", "cpu", "auto"], default="auto")
    p.add_argument("--dtype", choices=["fp16", "bf16", "fp32"], default=None,
                   help="Default: fp16 on CUDA, fp32 elsewhere.")
    p.add_argument("--prompts-file", default="prompts.yaml",
                   help="Prompts YAML to load (relative to this script). Default: prompts.yaml.")
    p.add_argument("--images-dir", default="images",
                   help="Output directory name for generated PNGs (relative to this script). "
                        "Use a distinct name (e.g. images-v2) to keep new runs from mixing with "
                        "previously curated candidates. Default: images.")
    return p.parse_args()


def compute_filename(
    key: str,
    style_name: str,
    model_name: str,
    seed: int,
    multi_seed: bool,
    canonical_style: str = "realistic",
) -> str:
    """
    Canonical path (what the app reads) stays `{key}.png` whenever we're on the
    default model, first seed, and the canonical style for this run.
    Everything else gets tagged so comparison runs never clobber the canonical.

    `canonical_style` is "realistic" when running --style both (or realistic alone),
    or the user's chosen style when running a single non-realistic one — that way
    `--style cartoon` alone writes `burger.png` directly.
    "none" (mascot) is also always treated as canonical.
    """
    is_canonical_style = style_name == canonical_style or style_name == "none"
    is_default_model = model_name == DEFAULT_MODEL
    if is_canonical_style and is_default_model and not multi_seed:
        return key

    tag_bits: list[str] = []
    if not is_canonical_style:
        tag_bits.append(style_name)
    if not is_default_model:
        tag_bits.append(model_name)
    if multi_seed:
        tag_bits.append(f"seed{seed}")
    return f"{key}__{'_'.join(tag_bits)}" if tag_bits else key


def main():
    args = parse_args()

    prompts_path = Path(args.prompts_file)
    if not prompts_path.is_absolute():
        prompts_path = SCRIPT_DIR / prompts_path
    images_dir = Path(args.images_dir)
    if not images_dir.is_absolute():
        images_dir = SCRIPT_DIR / images_dir

    data = load_prompts(prompts_path)
    categories = list(data["categories"].keys())
    all_keys = [k for (_c, k, _p, _a) in flatten_items(data)]

    if args.category is not None:
        assert args.category in categories, (
            f"--category '{args.category}' not in {prompts_path.name}. "
            f"Available: {categories}"
        )
    if args.item is not None:
        assert args.item in all_keys, (
            f"--item '{args.item}' not in {prompts_path.name}. "
            f"Available keys: {all_keys}"
        )

    items = flatten_items(data, category_filter=args.category)
    if args.item:
        items = [t for t in items if t[1] == args.item]
        assert items, f"item '{args.item}' not found in {prompts_path.name}"

    if not items:
        print("[images] Nothing to generate.")
        return

    device = detect_device() if args.device == "auto" else args.device
    dtype_name = args.dtype or default_dtype_for(device)

    if device == "mps" and dtype_name == "fp16":
        print(
            "[images] ⚠  MPS + fp16 on SDXL is known to produce NaN "
            "(UNet attention overflows even with the fp16-fix VAE). "
            "Output will be all-black / all-white. Falling back to fp32.\n"
            "           Pass --dtype bf16 to opt in to bf16 if you really want half-precision."
        )
        dtype_name = "fp32"

    # Parse --model: "all", "a,b,c", or single name.
    if args.model == "all":
        models = list(MODEL_PRESETS.keys())
    else:
        models = [m.strip() for m in args.model.split(",") if m.strip()]
    for m in models:
        assert m in MODEL_PRESETS, f"unknown model: '{m}'. Choices: {list(MODEL_PRESETS.keys())}"

    # Resolve styles: "both" → [realistic, cartoon]; otherwise the single name.
    # Mascot items (apply_style=False) always render as style_name="none".
    styles_to_run = (
        ["realistic", "cartoon"] if args.style == "both" else [args.style]
    )
    # The first style listed is the canonical for filenames — when running a
    # single style alone, it goes to `{key}.png`; the other becomes tagged.
    canonical_style = styles_to_run[0]
    styles_dict = data.get("styles", {})
    negative = data.get("negative", "")

    seeds = list(range(args.seed_start, args.seed_start + args.seeds))
    multi_seed = len(seeds) > 1

    print(f"[images] prompts={prompts_path.name}  out={images_dir.name}/")
    print(f"[images] plan: {len(models)} model(s) x {len(items)} item(s) "
          f"x styles={styles_to_run} x {len(seeds)} seed(s)")
    print(f"[images] device={device}  dtype={dtype_name}  "
          f"rembg={not args.no_rembg}  pad={not args.no_pad}  padding={args.padding}")

    total_saved = 0
    for mi, model_name in enumerate(models, start=1):
        preset = MODEL_PRESETS[model_name]
        width = args.width or preset["size"]
        height = args.height or preset["size"]
        steps = args.steps if args.steps is not None else preset["steps"]
        guidance = args.guidance if args.guidance is not None else preset["guidance"]

        # Build work list for this model (skip-existing is per-filename)
        work: list[tuple[str, str, str, str, int, str]] = []
        for (category, key, base, apply_style) in items:
            effective_styles = styles_to_run if apply_style else ["none"]
            for style_name in effective_styles:
                for seed in seeds:
                    filename = compute_filename(
                        key, style_name, model_name, seed, multi_seed, canonical_style,
                    )
                    if args.skip_existing and (images_dir / category / f"{filename}.png").exists():
                        continue
                    work.append((category, key, base, style_name, seed, filename))

        print(f"\n[images] ─── model {mi}/{len(models)}: {model_name} "
              f"— {len(work)} image(s) — size={width}x{height} steps={steps} guidance={guidance}")
        if not work:
            print("[images]   (all targets exist — skipping)")
            continue

        canvas_size = args.canvas_size if args.canvas_size is not None else max(width, height)

        pipe = load_pipeline(model_name, preset, device, dtype_name)
        for (category, key, base, style_name, seed, filename) in work:
            full_prompt = resolve_prompt(base, style_name, styles_dict)
            generate_one(
                pipe, images_dir, category, key, filename, full_prompt, negative,
                seed, width, height, steps, guidance,
                use_rembg=not args.no_rembg,
                use_pad=not args.no_pad,
                padding_ratio=args.padding,
                canvas_size=canvas_size,
            )
            total_saved += 1

        # Free GPU / unified memory between models
        del pipe
        try:
            import torch
            if torch.backends.mps.is_available():
                torch.mps.empty_cache()
            if torch.cuda.is_available():
                torch.cuda.empty_cache()
        except Exception:
            pass
        import gc
        gc.collect()

    try:
        rel = images_dir.relative_to(SCRIPT_DIR.parent)
    except ValueError:
        rel = images_dir
    print(f"\n[images] Done. {total_saved} image(s) saved to {rel}/")


if __name__ == "__main__":
    main()
