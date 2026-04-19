"""
image-gen/compress_images.py

Compress PNGs recursively into WebP (default) or optimized PNG, mirroring the
source layout into --out. WebP with alpha is the recommended format for the
committed/served asset set — typically 70-90% smaller than the normalized PNG.

Usage:
  uv run python compress_images.py --dir images-canonical --out images-serve
  uv run python compress_images.py --dir images-canonical --out images-serve --quality 90
  uv run python compress_images.py --dir images-canonical --out images-lossless --lossless
  uv run python compress_images.py --dir images-canonical --out images-png --format png
"""

import argparse
from pathlib import Path

from PIL import Image

from generate_images import SCRIPT_DIR


def compress_one(
    src: Path,
    dest: Path,
    fmt: str,
    quality: int,
    lossless: bool,
    method: int,
) -> int:
    with Image.open(src) as raw:
        raw.load()
        img = raw.convert("RGBA") if raw.mode != "RGBA" else raw.copy()

    dest.parent.mkdir(parents=True, exist_ok=True)

    if fmt == "webp":
        kwargs = dict(format="WEBP", method=method)
        if lossless:
            kwargs.update(lossless=True, quality=100)
        else:
            kwargs.update(quality=quality)
        img.save(dest, **kwargs)
    else:  # png
        img.save(dest, format="PNG", optimize=True, compress_level=9)

    return dest.stat().st_size


def rel(path: Path, root: Path) -> str:
    try:
        return str(path.relative_to(root))
    except ValueError:
        return str(path)


def parse_args():
    p = argparse.ArgumentParser(
        description="Compress PNGs (recursive) into WebP or optimized PNG, mirroring layout into --out."
    )
    p.add_argument("--dir", type=Path, required=True)
    p.add_argument("--out", type=Path, required=True)
    p.add_argument("--format", choices=["webp", "png"], default="webp")
    p.add_argument("--quality", type=int, default=85,
                   help="Lossy quality 1-100. Default 85 (imperceptible on stickers).")
    p.add_argument("--lossless", action="store_true",
                   help="WebP lossless. Ignores --quality.")
    p.add_argument("--method", type=int, default=4,
                   help="WebP effort 0-6 (higher=slower/smaller). Default 4.")
    p.add_argument("--dry-run", action="store_true")
    return p.parse_args()


def main():
    args = parse_args()
    src = (args.dir if args.dir.is_absolute() else SCRIPT_DIR / args.dir).resolve()
    dst = (args.out if args.out.is_absolute() else SCRIPT_DIR / args.out).resolve()
    assert src.is_dir(), f"--dir is not a directory: {src}"
    assert src != dst, "--out must differ from --dir"
    assert 1 <= args.quality <= 100, f"--quality out of range: {args.quality}"
    assert 0 <= args.method <= 6, f"--method out of range: {args.method}"

    paths = sorted(src.rglob("*.png"))
    if not paths:
        print(f"[compress] no PNGs under {rel(src, SCRIPT_DIR)}")
        return

    ext = ".webp" if args.format == "webp" else ".png"
    mode = "lossless" if args.lossless else f"q={args.quality}"
    print(f"[compress] {len(paths)} file(s) {rel(src, SCRIPT_DIR)} -> {rel(dst, SCRIPT_DIR)}  "
          f"format={args.format} {mode} method={args.method}"
          f"{'  (dry-run)' if args.dry_run else ''}")

    total_src = 0
    total_dst = 0
    for src_path in paths:
        rel_path = src_path.relative_to(src)
        dest_path = dst / rel_path.with_suffix(ext)
        src_size = src_path.stat().st_size
        total_src += src_size

        if args.dry_run:
            print(f"  {rel_path}  {src_size // 1024}K -> {dest_path.suffix}")
            continue

        out_size = compress_one(
            src_path, dest_path, args.format, args.quality, args.lossless, args.method
        )
        total_dst += out_size
        ratio = out_size / src_size * 100
        print(f"  {rel_path}  {src_size // 1024}K -> {out_size // 1024}K  ({ratio:.0f}%)  "
              f"{rel(dest_path, dst)}")

    if not args.dry_run and total_src:
        print(f"[compress] total: {total_src / 1024 / 1024:.1f} MB -> "
              f"{total_dst / 1024 / 1024:.1f} MB  ({total_dst / total_src * 100:.0f}%)")


if __name__ == "__main__":
    main()
