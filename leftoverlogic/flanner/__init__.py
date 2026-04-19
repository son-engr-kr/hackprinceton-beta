"""
Flanner backend package.

Public surface (import as `from flanner import plan`, etc.):
    config   — env-driven constants (Knot, K2, Gemini, Mongo, paths)
    knot     — Knot API wrappers (auth, /cart, /cart/checkout, product picks)
    llm      — K2 Think V2 + Vertex Gemini call sites + prompt + mock variants
    catalog  — Amazon Fresh catalog loader + plan-side coercion
    plan     — orchestrator: generate_plan(feedback_history, space_id) -> dict
    intent   — parse_intent(text) -> (intent, feedback|None)
    format   — plan message + order confirmation formatters for iMessage
    checkin  — daily /checkin state machine + adherence logging
    db       — MongoDB singleton + collection accessors
    persist  — write-through helpers (plans, cart_operations, adherence)
    cli      — JSON stdin/stdout bridge for the TS orchestrator (spectrum_loop.mjs)
"""
