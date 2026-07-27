# License-Key Setup

Steps to get the 5-uses-per-code system live, plus automated Etsy code
assignment/delivery and auto-replenishment.

## 1. Create the Supabase project

1. Create a free-tier project at supabase.com.
2. Open the SQL editor and run `supabase/schema.sql` from this repo. It's
   idempotent (safe to re-run) and creates/updates, in one pass:
   - the `licenses` table
   - the `consume_license_use` function that atomically decrements
     `uses_remaining` (safe under concurrent requests)
   - the `assigned` / `assigned_at` columns used by the auto-assignment flow
     below
   - the `assign_next_license` function that atomically claims the oldest
     unassigned code (safe under concurrent requests — two simultaneous
     sales can never be handed the same code)

   If you already ran an older version of this file, just re-run the current
   `supabase/schema.sql` — every statement uses `if not exists` / safe
   `create or replace` patterns, so it won't error or duplicate anything.
3. In Project Settings → API, copy the **Project URL** and the **service_role**
   key (not the `anon` key — the service role key is required so the Netlify
   functions can read/write past Row Level Security, which is enabled with no
   public policies).

## 2. Configure Netlify environment variables

In the Netlify site's Site settings → Environment variables, add (alongside
the existing `ANTHROPIC_API_KEY`):

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `ALERT_WEBHOOK_URL` — **Ken needs to set this to a real URL before launch.**
  See "Low-supply alert" below.
- `CODE_SUPPLY_THRESHOLD` (optional, default `20`) — remaining unassigned
  codes below this triggers auto-replenishment.
- `CODE_SUPPLY_BATCH_SIZE` (optional, default `100`) — how many codes to
  generate per replenishment run.

Redeploy after adding them.

## 3. Seed the initial batch of codes

Locally:

```
npm install
SUPABASE_URL=https://xxxx.supabase.co SUPABASE_SERVICE_ROLE_KEY=xxxx npm run generate-codes -- 100
```

This inserts 100 unique `FG-XXXX-XXXX` codes (5 uses each, unassigned) into
Supabase and writes a `licenses-<timestamp>.csv` file in the current
directory. Don't commit that CSV; `.gitignore` already excludes `*.csv`. You
generally won't need this CSV for day-to-day delivery anymore — see the
automated flow below — but it's still useful for manual/backup seeding.

To generate a different batch size: `npm run generate-codes -- 25`.

## 4. Automated Etsy code assignment & delivery

Codes are no longer hand-delivered. Two Netlify functions and one Zap handle
it end to end:

- **`assign-next-code`** — claims the next unused code from Supabase
  (atomic, race-safe) and returns it. This is what Zapier calls per Etsy
  order.
- **`check-code-supply`** — runs automatically once a day (configured in
  `netlify.toml` via `schedule = "@daily"`). Counts unassigned codes; if the
  count is below `CODE_SUPPLY_THRESHOLD` (default 20), it generates
  `CODE_SUPPLY_BATCH_SIZE` (default 100) more and inserts them, all
  unassigned, into `licenses`.

### Function URLs

Replace `flexandgrace-resume.netlify.app` if the site is deployed under a
different domain.

- Assign endpoint (Zapier webhook target):
  `https://flexandgrace-resume.netlify.app/.netlify/functions/assign-next-code`
- Scheduled replenishment (runs on its own; this URL is only for manual
  testing — see the testing checklist):
  `https://flexandgrace-resume.netlify.app/.netlify/functions/check-code-supply`

`assign-next-code` is a `POST` endpoint. Body is optional — Zapier can send
`{}` or include `orderId`/`email` for logging:

```json
{ "orderId": "12345", "email": "buyer@example.com" }
```

Response on success:

```json
{ "success": true, "code": "FG-AB12-CD34" }
```

Response when the pool is empty (`503`):

```json
{ "success": false, "error": "No license codes are available right now. Ken has been alerted." }
```

### Low-supply / zero-supply alert

The daily replenishment run is designed to keep the pool from ever hitting
zero, but as a safety net, both `assign-next-code` (if it ever finds zero
codes) and `check-code-supply` (if it finds the pool was already at zero
before replenishing) POST a JSON payload to `ALERT_WEBHOOK_URL`:

```json
{
  "event": "license_code_supply_alert",
  "timestamp": "2026-07-27T00:00:00.000Z",
  "reason": "zero_supply",
  "orderId": "12345",
  "email": "buyer@example.com"
}
```

**Ken: this needs to point somewhere real before launch, or these alerts go
nowhere.** The simplest setup:

1. In Zapier, create a new Zap with trigger **"Webhooks by Zapier" → "Catch
   Hook"**. Copy the custom webhook URL it gives you.
2. Set that URL as `ALERT_WEBHOOK_URL` in Netlify's environment variables
   (see step 2 above), then redeploy.
3. Add an action to that same Zap — **"Email by Zapier" → "Send Outbound
   Email"** (or a Slack DM/message action) — to yourself, using the `reason`
   field from the webhook payload in the subject/body so you know at a
   glance whether it was a live sale that failed or the daily check catching
   an empty pool.

Until `ALERT_WEBHOOK_URL` is set, the functions log the alert to the Netlify
function logs instead of erroring, so nothing breaks — but you won't be
notified. Don't launch without wiring this up.

## 5. Delivery instructions template

`templates/delivery-instructions.txt` and `templates/delivery-instructions.html`
contain the message sent to buyers, with a `{{CODE}}` placeholder. Zapier
substitutes the real code into a copy of this text — it doesn't call
anything in this repo to do so; you paste the template text directly into
the Zap step (see below).

## 6. Building the Zap

Zapier itself is configured by Ken — Claude Code can't do this part. Build
one Zap with these steps:

1. **Trigger: New Order — Etsy.** Connect the Flex & Grace Etsy shop.
   Filter (Zapier's built-in "Only continue if..." step, or a filter on the
   trigger) so it only fires for orders containing the Resume Generator
   listing.
2. **Action 1: Webhooks by Zapier → POST.**
   - URL: `https://flexandgrace-resume.netlify.app/.netlify/functions/assign-next-code`
   - Payload type: JSON
   - Data: optionally map the Etsy order ID and buyer email into `orderId`
     and `email` fields (used only for logging/alerts, not required).
   - This returns `{ "success": true, "code": "FG-AB12-CD34" }` (or a `503`
     with `success: false` if the pool is empty — see the alert section
     above; that failure is also why Action 2/3 should be conditioned on
     `success` being `true`, e.g. with a Zapier filter step).
3. **Action 2: Formatter by Zapier → Text → Replace.**
   - Input: paste the contents of `templates/delivery-instructions.txt` (or
     the HTML version if sending via an email action that renders HTML).
   - Find: `{{CODE}}`
   - Replace: the `code` field from Action 1's output.
4. **Action 3: Send to the buyer.**
   - If Etsy's messaging API is available as a Zapier action for your Etsy
     app: use "Etsy → Send Message" with the formatted text from Action 2.
   - Otherwise, use the buyer's email from the Etsy order data with an email
     action (e.g. "Email by Zapier" or Gmail) — subject like "Your Flex &
     Grace Resume Generator code", body from Action 2's output (use the
     `.html` template if the email action supports HTML body).

## 7. Testing checklist before going live

- Call `assign-next-code` twice in a row (e.g. with `curl` or Postman) —
  confirm two different codes are returned, and in Supabase's table editor
  confirm both rows now have `assigned = true` and an `assigned_at`
  timestamp.
- Simulate near-zero supply: in Supabase, set `assigned = true` on all but a
  couple of codes (or temporarily set `CODE_SUPPLY_THRESHOLD` higher than
  your current unassigned count), then manually invoke
  `check-code-supply`'s URL — confirm it generates a new batch and the
  Netlify function log reports the count generated and the new remaining
  count.
- Force zero supply (mark every code `assigned = true`), call
  `assign-next-code` — confirm it returns the 503/"no codes available"
  response and the alert webhook fires (check the Zapier Zap history, or
  the Netlify function logs if `ALERT_WEBHOOK_URL` isn't set yet).
- Run the `{{CODE}}` substitution (Action 2 above, or manually) and confirm
  no leftover `{{CODE}}` text remains and the code is inserted correctly.
- End-to-end: manually trigger the full Zap chain (assign code → build
  instructions → simulate delivery) with a test order and confirm the
  message a buyer would receive looks correct and complete.
- Existing license-key checks still apply:
  - Enter a valid code → generates successfully, remaining count decreases
  - Generate 5 times → 5th succeeds, remaining shows 0
  - Attempt a 6th generation → blocked with the "used all generations"
    message and Etsy link
  - Refresh the page / clear `sessionStorage` mid-session → server-side
    count still enforced (re-entering the same code shows the
    already-reduced count)
  - Invalid/made-up code → "We couldn't find that code" message, no access
  - "Try Sample" (from the gate screen or the main panel) works without a
    code
