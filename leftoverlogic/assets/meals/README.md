# Meal image assets

Drop meal images here to have `spectrum_loop.mjs` attach them to plan messages.

## Naming convention

Filename = lowercased keyword (spaces → underscore), `.png` or `.jpg`.

Examples:
- `chicken_tikka.png` — matches meals whose title or mirrors contain "chicken tikka"
- `shrimp_linguine.png` — matches "shrimp linguine", "garlic butter shrimp linguine"
- `poke_bowl.png` — matches "poke bowl", "salmon poke", "tuna poke"
- `burger.png` — matches anything containing "burger"
- `default.png` — fallback when nothing else matches

## Behavior

- For each generated plan, Spectrum picks the first meal whose title contains a known keyword,
  finds a matching file here, and attaches it alongside the plan text.
- If no file matches, the plan is sent as text only — no error.

## Quick seed

Any free-license food photo works. Suggested sources: Unsplash, Pexels. Keep each image under
~1 MB for snappy iMessage delivery.
