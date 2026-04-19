"""
JSON stdin/stdout bridge between the Node orchestrator (spectrum_loop.mjs)
and the Python pipeline.

Protocol:
    stdin   — JSON body (command-specific)
    stdout  — one JSON document (result)
    stderr  — diagnostic/print output from the Python side
    exit 0  — success, non-zero — failure (stderr has the reason)

Commands (argv[1]):
    generate        → {feedback_history?, round_num?, space_id?}
                      → {plan, message, plan_id}
    order           → {plan}
                      → {cart_http, checkout_http, message}
    parse           → {text}
                      → {intent, feedback}
    checkin_prompt  → {last_plan}
                      → {message, meal_title, day, adherence_summary}
    checkin_record  → {reply, meal_title?, day?, space_id?}
                      → {ack, status, reason}
    adherence       → {n?}
                      → {summary}
    plan_status     → {plan_id, status}
                      → {ok, plan_id, status}
"""
from __future__ import annotations

import contextlib
import json
import sys

from . import catalog, checkin, format, intent, llm, pantry as pantry_mod, persist, plan, vision


@contextlib.contextmanager
def _stdout_to_stderr():
    """Suppress diagnostic prints from stdout so only our JSON lands there."""
    saved = sys.stdout
    sys.stdout = sys.stderr
    try:
        yield
    finally:
        sys.stdout = saved


def _read_body() -> dict:
    raw = sys.stdin.read().strip()
    return json.loads(raw) if raw else {}


# ─── Command handlers ──────────────────────────────────────────────────

def cmd_generate(body: dict) -> dict:
    feedback_history = body.get("feedback_history") or []
    round_num = int(body.get("round_num") or (len(feedback_history) + 1))
    space_id = body.get("space_id")
    with _stdout_to_stderr():
        result = plan.generate(feedback_history, space_id=space_id)
        message = format.plan_message(result, round_num)
    return {"plan": result, "message": message, "plan_id": result.get("_plan_id")}


def cmd_order(body: dict) -> dict:
    p = body.get("plan") or {}
    with _stdout_to_stderr():
        result = plan.place_order(p)
        message = format.order_confirmation(result)
    return {
        "cart_http": result.get("cart_http"),
        "checkout_http": result.get("checkout_http"),
        "ordered_items": result.get("ordered_items"),
        "skipped_items": result.get("skipped_items"),
        "total_cost": result.get("total_cost"),
        "message": message,
    }


def cmd_parse(body: dict) -> dict:
    text = body.get("text") or ""
    intent_name, feedback = intent.parse(text)
    return {"intent": intent_name, "feedback": feedback}


def cmd_checkin_prompt(body: dict) -> dict:
    with _stdout_to_stderr():
        result = checkin.prompt(body.get("last_plan"))
        result["adherence_summary"] = checkin.adherence_summary()
    return result


def cmd_checkin_record(body: dict) -> dict:
    with _stdout_to_stderr():
        return checkin.record_reply(
            reply=body.get("reply") or "",
            meal_title=body.get("meal_title"),
            day=body.get("day"),
            space_id=body.get("space_id"),
        )


def cmd_adherence(body: dict) -> dict:
    return {"summary": checkin.adherence_summary(n=int(body.get("n") or 7))}


def cmd_plan_status(body: dict) -> dict:
    plan_id = body.get("plan_id")
    status = body.get("status")
    if not plan_id or not status:
        return {"ok": False, "error": "plan_id and status required"}
    with _stdout_to_stderr():
        persist.mark_plan_status(plan_id, status)
    return {"ok": True, "plan_id": plan_id, "status": status}


def cmd_photo(body: dict) -> dict:
    """Process an image file (receipt or food).

    body: {image_path, space_id?, hint?: "food"|"receipt"}
    Returns: {kind, ack_message, parsed, photo_log_id, pantry_deltas}
    """
    import pathlib
    image_path = body.get("image_path")
    if not image_path:
        return {"ok": False, "error": "image_path required"}
    space_id = body.get("space_id")

    with _stdout_to_stderr():
        p = pathlib.Path(image_path)
        if not p.exists():
            return {"ok": False, "error": f"image not found: {image_path}"}
        img_bytes = p.read_bytes()
        mime = body.get("mime_type") or None
        print(f"   👁  vision.analyze ({len(img_bytes)} bytes, mime={mime})")
        parsed = vision.analyze(img_bytes, mime_type=mime, source_path=str(p))
        kind = parsed.get("kind", "unclear")
        confidence = parsed.get("confidence")
        print(f"   🔍 kind={kind} confidence={confidence}")

        photo_log_id = persist.log_photo(
            kind=kind,
            image_path=str(p),
            parsed=parsed,
            confidence=confidence,
            space_id=space_id,
            applied=(kind in ("food", "receipt")),
        )

        deltas: list[dict] = []
        ack = ""

        if kind == "receipt":
            items = parsed.get("items") or []
            deltas = pantry_mod.add_from_receipt(items, photo_log_id=photo_log_id)
            print(f"   🩺 requesting health advice on {len(items)} item(s)")
            advice = llm.advise_receipt(items)
            if advice:
                print(f"      → {advice[:80]}")
            ack = format.photo_ack_receipt(parsed, deltas, advice=advice)

        elif kind == "food":
            dish = parsed.get("dish_name") or "unknown dish"
            portions = float(parsed.get("portions") or 1.0)
            print(f"   🧠 decomposing '{dish}' ({portions}x) via K2")
            try:
                decomp = llm.decompose_food(dish, portions, catalog.load())
                ingredients = decomp.get("ingredients") or []
            except Exception as e:
                print(f"   ⚠ K2 decompose failed: {type(e).__name__}: {e}")
                ingredients = []
                decomp = {}

            if ingredients:
                deltas = pantry_mod.deduct_from_food(ingredients, photo_log_id=photo_log_id)

            kcal = decomp.get("estimated_kcal") or parsed.get("estimated_kcal")
            checkin.record(
                {
                    "ts": None,
                    "day": checkin.today_dow(),
                    "meal_title": dish,
                    "reply": f"(photo) {dish}",
                    "status": "cooked",
                    "reason": None,
                    "consumed_ingredients": ingredients,
                    "estimated_kcal": kcal,
                    "photo_log_id": photo_log_id,
                },
                space_id=space_id,
            )

            print(f"   🩺 requesting health advice on meal")
            food_advice = llm.advise_food(dish, kcal, ingredients)
            if food_advice:
                print(f"      → {food_advice[:80]}")
            ack = format.photo_ack_food(dish, portions, ingredients, kcal, decomp, advice=food_advice)

        else:
            ack = format.photo_ack_unclear(confidence)

    return {
        "kind": kind,
        "ack": ack,
        "parsed": parsed,
        "photo_log_id": photo_log_id,
        "pantry_deltas": deltas,
    }


def cmd_pantry(body: dict) -> dict:
    with _stdout_to_stderr():
        return {"stock": pantry_mod.current_stock(limit=int(body.get("limit") or 50))}


HANDLERS = {
    "generate":       cmd_generate,
    "order":          cmd_order,
    "parse":          cmd_parse,
    "checkin_prompt": cmd_checkin_prompt,
    "checkin_record": cmd_checkin_record,
    "adherence":      cmd_adherence,
    "plan_status":    cmd_plan_status,
    "photo":          cmd_photo,
    "pantry":         cmd_pantry,
}


def main() -> None:
    if len(sys.argv) < 2 or sys.argv[1] not in HANDLERS:
        sys.stderr.write(f"usage: python -m flanner.cli {{{'|'.join(HANDLERS)}}}\n")
        sys.exit(2)
    cmd = sys.argv[1]
    try:
        body = _read_body()
        result = HANDLERS[cmd](body)
        sys.stdout.write(json.dumps(result, ensure_ascii=False, default=str))
        sys.stdout.flush()
    except Exception as e:
        sys.stderr.write(f"{type(e).__name__}: {e}\n")
        sys.exit(1)


if __name__ == "__main__":
    main()
