# Knot Production Preview — Feasibility + Demo Plan

Branch: `knot-production-preview`. Purpose: show the Knot side running on
`production.knotapi.com` instead of sandbox, so the judge sees a real cart
being populated on a real Amazon account, without ever charging it.

---

## 1. What actually changes between dev and prod (live probe results)

Live probes logged with prod creds (`a390e79d-...`) against `production.knotapi.com`:

| type                   | dev count | prod count | prod additions |
|------------------------|-----------|------------|----------------|
| `transaction_link`     | 4         | **6**      | `+ Amazon Web (2330)`, `+ Uber Eats`, `+ Shop Pay` (some were already in dev — treat this as "full set") |
| `card_switcher`        | 51        | 51         | same |
| `subscription_manager` | 10        | **2**      | prod restricted — only Netflix + YouTube Premium visible |
| `shopping`             | 1         | **2**      | `+ Amazon Web (2330)` |

Response shape note: dev `/merchant/list` returns `{merchants: [...]}`; prod returns a flat `[...]`. Knot wrapper in `flanner/knot.py` has to accept either.

Raw prod responses saved at `api/data/merchants/prod_merchants_*.json`.

## 2. What Knot does NOT offer (myth-busting)

There is **no product search, catalog, or price API** in Knot. Probed:
- `POST /product/search` → 404
- `POST /products/search` → 404
- `POST /search`, `/catalog`, `/catalog/search`, `/products` → all 404

Knot's contract is strictly: **you bring an `external_id` (ASIN), we add it to the cart**. Discovery is out of scope.

Implications for the "search products, show price, add to Amazon cart" vision:
- The product search/price display has to come from elsewhere (curated ASIN list OR Amazon Product Advertising API OR scraper).
- Knot is only the last mile — the hand-off that puts an item into a real user's real Amazon Fresh cart.

## 3. The gate that blocks prod today

```
POST /cart  (prod)
body: {external_user_id: "prod-probe-0001", merchant_id: 44, products: [...]}
→ HTTP 400 USER_NOT_FOUND — "The user was not found. Please check the ID provided."
```

**Prod `/cart` refuses to run until a real Amazon account is OAuth-linked under that external_user_id.**

Linking path (works in prod — verified):
```
POST /session/create
body: {type: "transaction_link", external_user_id: "<whatever we choose>"}
→ 200 {"session": "aefcfb54-..."}
```

That session id gets fed to Knot Link (web SDK) in a browser. The presenter logs into their real Amazon account in that modal. Knot fires an `AUTHENTICATED` webhook back to our ngrok endpoint, and from that point `/cart` works for that external_user_id.

Session `type` values valid in prod: `transaction_link`, `subscription_manager`. **No `shopping` session type** — the shopping merchant (Amazon) is reached through the `transaction_link` session (it's the same auth on Knot's side). `card_switcher` requires a `card_id`.

## 4. What the ASIN pool has to look like

Current `data/amazon_fresh_catalog.json` uses invented patterns (`B0CHCKNBRST`, `B0TRKYGRND1`, …). These are **NOT real ASINs** — Amazon/Knot will reject them in prod.

Two viable options:

### Option A — curate 10–15 real Amazon Fresh ASINs by hand
Pick a handful of real Amazon Fresh items by searching amazon.com/alm/storefront, record their actual ASINs (e.g. `B07Q5FQXBJ` = Amazon Fresh Organic Chicken Breast, etc.). Replace or augment the `catalog_items` collection.

- Cost: 45 min
- Risk: ASIN might be region-specific (Amazon Fresh isn't available everywhere). Test delivery ZIP first.

### Option B — use the real ASINs already in `data/sync_amazon.json`
These are real household items from a real user's Amazon history (Wemo plug, Ring doorbell, Hydro Flask, …). They'll work in prod `/cart`, but they aren't food — the meal-plan → grocery story breaks.

- Cost: 0 min (already in repo)
- Use case: demo "real cart add" without the meal-plan narrative. Good as a fallback.

**Recommended: A + B.** Curate 10 food ASINs, keep the 200+ household ASINs from sync_amazon.json as a fallback pool the code can fall back to if an AF ASIN fails.

## 5. Safe demo flow — what to actually show judges

```
Opening (sandbox, looks the same as today):
  ① User texts "start" → Gemini decomposes → K2 plans → iMessage reply
  ② User says "yes" → sandbox /cart + /cart/checkout(simulate=failed)
                       → HTTP 202 queued, no charge
```

Then the twist:

```
Production extension (for judges):
  ③ Presenter clicks "Link my real Amazon" button → Knot Link modal
       → logs into their own amazon.com
       → webhook AUTHENTICATED fires
  ④ Text "start" again with external_user_id = presenter's real one
       → same K2 plan → same iMessage reply
  ⑤ User says "yes" → prod /cart (no simulate)
       → items actually appear in presenter's Amazon Fresh cart
       → Presenter opens amazon.com on their phone to prove it's there
  ⑥ STOP. Do NOT call prod /cart/checkout without simulate=failed.
       Say in the pitch: "Last step is one-tap confirm in the Amazon app.
       We stop here deliberately — no unplanned charge on anyone's card."
```

### Why this is acceptable to judges
- Real transaction_link pulled live.
- Real cart modified on a real Amazon account.
- No real charge. Presenter's card stays untouched.
- The story "production-grade" is defensible without any deception.

### Why /cart/checkout stays off
| Risk | Impact |
|---|---|
| Accidental `/cart/checkout` without simulate | Presenter's real card charged, real delivery dispatched |
| Test data in prod cart | Visible on next honest Amazon login — cleanup needed |
| Knot rate limit on prod | Unknown. Dev already hit 429 today |

Mitigation in code: `flanner/knot.py:checkout_simulated()` hard-codes `simulate=failed`. A new `knot.checkout_real()` is intentionally NOT added. Any real-checkout work happens outside our codebase, by hand.

## 6. Minimum code changes to support the dual mode

Everything is driven by env vars — zero new prompt/LLM work required.

### 6.1 `.env` addition
```
KNOT_MODE=dev                    # or "prod" — chooses which keys to load
```
(Existing `KNOT_PROD_CLIENT_ID` / `KNOT_PROD_SECRET` / `KNOT_PROD_BASE_URL` stay.)

### 6.2 `flanner/config.py`
```py
KNOT_MODE = os.environ.get("KNOT_MODE", "dev").lower()

if KNOT_MODE == "prod":
    KNOT_CLIENT_ID = os.environ["KNOT_PROD_CLIENT_ID"]
    KNOT_SECRET    = os.environ["KNOT_PROD_SECRET"]
    KNOT_BASE_URL  = os.environ["KNOT_PROD_BASE_URL"]
    EXTERNAL_USER_ID = os.environ.get("KNOT_PROD_USER_ID", "prod-demo-001")
else:
    # unchanged dev block
```

### 6.3 `/session/create` helper (new)
`flanner/knot.py :: create_session(type)` — returns `session_id` for the Knot Link web SDK. Used by a small static `knot_link.html` page (already in `sandbox/`) to start the OAuth flow.

### 6.4 Webhook server
`sandbox/webhook_server.py` already exists. On `AUTHENTICATED` → persist `users.linked_merchants[]`. On `SYNC_CART_SUCCEEDED` → mark `cart_operations.status=succeeded` with real Amazon cart payload. Promote to `flanner/webhook.py` if we go live.

### 6.5 NOT changed
- Plan generation (LLM layer — same)
- Adherence + pantry + vision pipelines (same)
- /cart endpoint — just hits prod when `KNOT_MODE=prod`
- `/cart/checkout` stays `simulate=failed` always

## 7. Pre-demo runbook

1. On demo laptop, presenter signs in to amazon.com in Safari (so the Knot Link popup has a logged-in Amazon session ready).
2. `ngrok http 8000` — get the public URL.
3. Register that URL as webhook in Knot dashboard → `/knot`.
4. `.env` → set `KNOT_MODE=prod`.
5. Start `webhook_server.py` (port 8000) + `spectrum_loop.mjs`.
6. Presenter opens `knot_link.html?session=<id>` in browser → logs into their own Amazon → AUTHENTICATED webhook fires → users collection updated.
7. `EXTERNAL_USER_ID` env now points to presenter's id.
8. Demo runs normally on iMessage. `/cart` goes to prod.
9. After demo: `KNOT_MODE=dev` again, clear presenter's Amazon cart manually.

## 8. What can go wrong

| Risk | Probability | Mitigation |
|---|---|---|
| Prod rate limit kicks in mid-demo | medium | keep sandbox backup running on another external_user_id; fail over |
| Presenter's Amazon account has no Fresh delivery in this ZIP | medium | pre-test Fresh availability night before; use regular Amazon ASINs if Fresh fails |
| Our curated food ASINs are wrong/regional | high | test every one from presenter's account before demo |
| Webhook doesn't fire on demo WiFi (ngrok blocked) | medium | backup: skip AUTHENTICATED handshake, presenter links in a pre-demo phase, then /cart works directly |
| Accidental `/cart/checkout` without simulate | low | code guard in `knot.py`; never add a real-checkout function |

## 9. Decision requested

A. **Go for it** — I write the dual-mode config + curate 10 food ASINs. You handle presenter Amazon login before demo. ~1h of my work.

B. **Prep-only** — I write the dual-mode config but don't curate ASINs; you or presenter decide day-of whether to flip. Safer.

C. **Skip for now** — sandbox-only demo; judges' "production wins" hint interpreted as "you showed working prod infra", which we can address in the pitch without actually hitting prod.

My read: **A**, because the judge specifically said production wins, and the only new code is config plumbing + a curated list. Risk is mostly operational (presenter needs to pre-link Amazon), not technical.
