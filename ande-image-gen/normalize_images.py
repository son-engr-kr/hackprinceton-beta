"""
ande-image-gen/normalize_images.py

Post-process already-generated transparent-background PNGs in a target
directory so every image is a square canvas with consistent padding around
the subject (trim alpha bbox → aspect-preserving scale → center on square).

Runs recursively under --dir. In-place by default; pass --out to mirror the
source layout into a sibling directory instead.

Usage:
    uv run python normalize_images.py --dir images                     # whole tree in place
    uv run python normalize_images.py --dir images/food                # one subtree
    uv run python normalize_images.py --dir images --padding 0.12
    uv run python normalize_images.py --dir images --canvas-size 1024  # force uniform side
    uv run python normalize_images.py --dir images --out images_norm   # mirror to sibling
    uv run python normalize_images.py --dir images --dry-run
"""

import argparse
from pathlib import Path

from PIL import Image

from generate_images import SCRIPT_DIR, pad_to_square


def has_usable_alpha(img: Image.Image) -> bool:
    """True when the image has an alpha channel with at least one transparent pixel."""
    if img.mode != "RGBA":
        return False
    lo, _hi = img.getchannel("A").getextrema()
    return lo < 255


def process_one(
    src: Path,
    dest: Path,
    canvas_size: int | None,
    padding_ratio: float,
    dry_run: bool,
) -> str:
    with Image.open(src) as raw:
        raw.load()
        img = raw.convert("RGBA") if raw.mode != "RGBA" else raw.copy()

    if not has_usable_alpha(img):
        return "skip (no alpha)"

    side = canvas_size if canvas_size is not None else max(img.size)
    out = pad_to_square(img, canvas_size=side, padding_ratio=padding_ratio)

    if dry_run:
        return f"would write {out.size[0]}x{out.size[1]} -> {rel(dest)}"

    dest.parent.mkdir(parents=True, exist_ok=True)
    out.save(dest)
    return f"{out.size[0]}x{out.size[1]} -> {rel(dest)}"


def rel(path: Path) -> str:
    try:
        return str(path.relative_to(SCRIPT_DIR))
    except ValueError:
        return str(path)


def parse_args():
    p = argparse.ArgumentParser(
        description="Normalize existing PNGs recursively: trim alpha bbox, center on a square canvas, pad.",
    )
    p.add_argument("--dir", type=Path, required=True,
                   help="Target directory. Walked recursively for *.png.")
    p.add_argument("--padding", type=float, default=0.08,
                   help="Transparent margin per edge as a fraction of canvas side. Default 0.08.")
    p.add_argument("--canvas-size", type=int, default=None,
                   help="Force uniform square side in px. Default: per-image max(w, h).")
    p.add_argument("--out", type=Path, default=None,
                   help="Write outputs mirrored under this directory instead of in-place.")
    p.add_argument("--dry-run", action="store_true",
                   help="List planned writes without touching disk.")
    return p.parse_args()


def main():
    args = parse_args()
    src_root = args.dir if args.dir.is_absolute() else (SCRIPT_DIR / args.dir)
    src_root = src_root.resolve()
    assert src_root.is_dir(), f"--dir is not a directory: {src_root}"

    out_root: Path | None = None
    if args.out is not None:
        out_root = args.out if args.out.is_absolute() else (SCRIPT_DIR / args.out)
        out_root = out_root.resolve()
        assert out_root != src_root, "--out must differ from --dir"

    paths = sorted(src_root.rglob("*.png"))
    if not paths:
        print(f"[normalize] no PNGs under {rel(src_root)}")
        return

    mode = "dry-run" if args.dry_run else (f"out={rel(out_root)}" if out_root else "in-place")
    print(f"[normalize] {len(paths)} file(s) under {rel(src_root)}  "
          f"padding={args.padding}  canvas={args.canvas_size or 'per-image'}  {mode}")

    normalized = 0
    skipped = 0
    for src in paths:
        if out_root is not None:
            dest = out_root / src.relative_to(src_root)
        else:
            dest = src
        msg = process_one(src, dest, args.canvas_size, args.padding, args.dry_run)
        if msg.startswith("skip"):
            print(f"  SKIP {rel(src)}  ({msg})")
            skipped += 1
        else:
            print(f"  OK   {rel(src)}  -> {msg}")
            normalized += 1

    print(f"[normalize] done. normalized={normalized}  skipped={skipped}")


if __name__ == "__main__":
    main()
