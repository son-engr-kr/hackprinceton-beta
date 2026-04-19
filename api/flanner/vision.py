"""
Image analysis via Gemma 3 multimodal (AI Studio, open-weight).

Single entry point: `analyze(image_bytes)` returns one of:

  {"kind": "receipt", "items": [{name, qty, unit, price}], "confidence": 0-1}
  {"kind": "food",    "dish_name": "...", "portions": <float>, "confidence": 0-1}
  {"kind": "unclear", "confidence": 0-1, "reason": "..."}

Gemma does routing + extraction in one shot. Food ingredient decomposition
is deliberately NOT here — that's K2's job (`llm.decompose_food`) because
it needs to respect our Amazon Fresh catalog as the constraint set.

Gemma caveat vs Gemini: no `system_instruction`, no `response_mime_type`
JSON mode. We prepend the prompt to the image content and parse raw text.
"""
from __future__ import annotations

import json
import mimetypes

from . import config
from .llm import _extract_json, _strip_think_tags


VISION_PROMPT = """You will be shown ONE image. Decide if it shows (a) a RECEIPT (grocery/food purchase ticket) or (b) a FOOD DISH (prepared or served food), or if it's neither.

Return STRICT JSON — no markdown, no prose:

For a receipt:
{
  "kind": "receipt",
  "confidence": <0.0-1.0>,
  "store_name": "<best guess, or null>",
  "purchased_at": "<YYYY-MM-DD if visible, else null>",
  "items": [
    {
      "name": "<product line text>",
      "qty": <number or null>,
      "unit": "<'each'|'lb'|'oz'|'kg'|'g'|'ml'|'l'|null>",
      "price": <number or null>
    }
  ],
  "total": <number or null>
}

For a food dish:
{
  "kind": "food",
  "confidence": <0.0-1.0>,
  "dish_name": "<most specific dish you can identify, e.g. 'Chicken Tikka Masala with Basmati Rice'>",
  "portions": <float, 1.0 = single typical serving, 0.5 = half, 2.0 = double>,
  "visible_ingredients_hint": ["<ingredient you can see in the photo>"],
  "estimated_kcal": <int>
}

If it's neither a receipt nor a food dish:
{
  "kind": "unclear",
  "confidence": <0.0-1.0>,
  "reason": "<one-line reason>"
}

Rules (read carefully — violating any = you misclassified):
- Default to "food" for any photo of edible items on a plate, tray, table, wrapper, or held in hand. This includes fast-food sandwiches, burgers, fries, etc. — EVEN IF you can see brand packaging (Sonic, McDonald's, Chick-fil-A, etc.). BRANDING ALONE IS NOT A RECEIPT.
- Only emit "receipt" when ALL THREE are visible at once:
    (a) an actual printed receipt (thermal paper) OR an order-confirmation screen
    (b) a list of line items
    (c) a price next to EACH line item AND a subtotal or total
  If any of those is missing (e.g. you can see a wrapper with a logo, a menu board, a packaging sticker, a drive-thru bag), it is NOT a receipt.
- For food: use generic dish names ("cheeseburger", "fries", "breakfast burrito") — do NOT fabricate brand-specific menu item names from a logo.
- When in doubt between "food" and "receipt", emit "food" (or "unclear" if you can't see food clearly).
- For real receipts: extract EVERY visible line item with its visible price. If an item has no visible price, OMIT IT — do not guess.
- Prices are numbers without currency symbol.
- Never include markdown fences. Never write 'null' as a string — write JSON null.
"""


def _guess_mime(path: str | None) -> str:
    if not path:
        return "image/jpeg"
    mt, _ = mimetypes.guess_type(path)
    return mt or "image/jpeg"


def analyze(image_bytes: bytes, mime_type: str | None = None, source_path: str | None = None) -> dict:
    """Call Gemma 3 multimodal on the image. Raises on network/API error.

    Returns the parsed JSON (dict). Caller is responsible for persistence —
    this function is stateless and does not touch Mongo.
    """
    from google import genai
    from google.genai import types

    if not config.GEMINI_API_KEY:
        raise RuntimeError("GEMINI_API_KEY not set (AI Studio key required for Gemma)")

    mime = mime_type or _guess_mime(source_path)
    client = genai.Client(api_key=config.GEMINI_API_KEY)
    resp = client.models.generate_content(
        model=config.AI_STUDIO_MODEL,
        contents=[
            types.Part.from_bytes(data=image_bytes, mime_type=mime),
            VISION_PROMPT,
        ],
        config=types.GenerateContentConfig(temperature=0.2),
    )
    parsed = _extract_json(_strip_think_tags(resp.text))
    # Occasionally the model wraps a single object in a 1-element array.
    if isinstance(parsed, list) and parsed:
        parsed = parsed[0]
    if not isinstance(parsed, dict):
        return {"kind": "unclear", "confidence": 0.0, "reason": "model returned non-object"}

    # Sanity check: if the model claimed "receipt" but most items lack prices,
    # it almost certainly hallucinated menu items from a fast-food wrapper/logo.
    # Flip to "unclear" so we ask the user for a cleaner photo instead of
    # dumping fabricated line items into their pantry.
    if parsed.get("kind") == "receipt":
        items = parsed.get("items") or []
        if items:
            with_price = sum(1 for it in items if it.get("price") not in (None, 0, ""))
            if with_price < max(2, len(items) // 2):
                return {
                    "kind": "unclear",
                    "confidence": float(parsed.get("confidence") or 0.3),
                    "reason": (
                        f"Claimed receipt but only {with_price}/{len(items)} items had prices — "
                        "likely a food photo or menu, not an actual receipt."
                    ),
                }
    return parsed
