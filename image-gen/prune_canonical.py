"""
image-gen/prune_canonical.py

Prune variant-tagged PNGs down to one canonical {key}.png per item.

Input filenames follow generate_images.py's compute_filename scheme:
  <key>.png                                    canonical (default style + model, single seed)
  <key>__<style>_<model>_seed<N>.png           any combination of tags

Output: --out/<category>/<key>.png  — one winner per key.

Usage:
  uv run python prune_canonical.py --dir images-raw --out images-canonical
  uv run python prune_canonical.py --dir images-raw --out images-canonical --style cartoon --seed 42
  uv run python prune_canonical.py --dir images-raw --out images-canonical --dry-run
"""

import argparse
import re
import shutil
from pathlib import Path

from generate_images import MODEL_PRESETS, SCRIPT_DIR

STYLE_TOKENS = {"realistic", "cartoon", "none"}
MODEL_TOKENS = set(MODEL_PRESETS.keys())
SEED_RE = re.compile(r"^seed(\d+)$")


def parse_variant(stem: str):
    """Return (key, style, model, seed) parsed from a filename stem."""
    if "__" not in stem:
        return stem, "realistic", "sdxl", None
    key, tags = stem.split("__", 1)
    style, model, seed = "realistic", None, None
    for tok in tags.split("_"):
        if tok in STYLE_TOKENS:
            style = tok
        elif tok in MODEL_TOKENS:
            model = tok
        else:
            m = SEED_RE.match(tok)
            if m:
                seed = int(m.group(1))
    return key, style, model, seed


def parse_args():
    p = argparse.ArgumentParser(
        description="Prune variant-tagged PNGs to one canonical {key}.png per item."
    )
    p.add_argument("--dir", type=Path, required=True, help="Source directory (recursive).")
    p.add_argument("--out", type=Path, required=True, help="Destination directory.")
    p.add_argument("--style", choices=["realistic", "cartoon", "any"], default="realistic",
                   help="Style to keep, or 'any' to accept mixed styles (useful when curating "
                        "winners by hand). Mascot 'none' is always kept. Default: realistic.")
    p.add_argument("--seed", type=int, default=None,
                   help="Preferred seed. Default: smallest seed available per key.")
    p.add_argument("--model", default=None,
                   help="Model filter. Default: accept any (tiebreak alphabetical).")
    p.add_argument("--move", action="store_true", help="Move instead of copy.")
    p.add_argument("--dry-run", action="store_true")
    return p.parse_args()


def rel(path: Path, root: Path) -> str:
    try:
        return str(path.relative_to(root))
    except ValueError:
        return str(path)


def main():
    args = parse_args()
    src = (args.dir if args.dir.is_absolute() else SCRIPT_DIR / args.dir).resolve()
    dst = (args.out if args.out.is_absolute() else SCRIPT_DIR / args.out).resolve()
    assert src.is_dir(), f"--dir is not a directory: {src}"
    assert src != dst, "--out must differ from --dir"

    candidates: dict[tuple[str, str], list[tuple[Path, str, str | None, int | None]]] = {}
    for p in sorted(src.rglob("*.png")):
        parts = p.relative_to(src).parts
        category = parts[0] if len(parts) > 1 else ""
        key, style, model, seed = parse_variant(p.stem)
        if args.style != "any" and style != "none" and style != args.style:
            continue
        if args.seed is not None and seed is not None and seed != args.seed:
            continue
        if args.model is not None and model is not None and model != args.model:
            continue
        candidates.setdefault((category, key), []).append((p, style, model, seed))

    if not candidates:
        print(f"[prune] no candidates under {rel(src, SCRIPT_DIR)} matching filters.")
        return

    mode = "dry-run" if args.dry_run else ("move" if args.move else "copy")
    print(f"[prune] style={args.style}  seed={args.seed or 'smallest'}  "
          f"model={args.model or 'any'}  mode={mode}  "
          f"{rel(src, SCRIPT_DIR)} -> {rel(dst, SCRIPT_DIR)}")

    picked = 0
    for (category, key), cands in sorted(candidates.items()):
        # Prefer seed == args.seed, then smallest seed, then alphabetical model.
        def sort_key(t):
            _, _, model, seed = t
            seed_rank = 0 if (args.seed is not None and seed == args.seed) else 1
            return (seed_rank, seed if seed is not None else -1, model or "")
        cands.sort(key=sort_key)
        winner = cands[0][0]

        out_rel = Path(category) / f"{key}.png" if category else Path(f"{key}.png")
        out_path = dst / out_rel

        if args.dry_run:
            print(f"  PICK {rel(winner, src)}  -> {out_rel}")
        else:
            out_path.parent.mkdir(parents=True, exist_ok=True)
            if args.move:
                shutil.move(str(winner), str(out_path))
            else:
                shutil.copy2(str(winner), str(out_path))
            print(f"  PICK {rel(winner, src)}  -> {out_rel}")
        picked += 1

    print(f"[prune] {picked} canonical file(s) written to {rel(dst, SCRIPT_DIR)}")


if __name__ == "__main__":
    main()
