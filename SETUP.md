# License-Key Setup

Steps to get the 5-uses-per-code system live.

## 1. Create the Supabase project

1. Create a free-tier project at supabase.com.
2. Open the SQL editor and run `supabase/schema.sql` from this repo. It creates
   the `licenses` table and the `consume_license_use` function that atomically
   decrements `uses_remaining` (safe under concurrent requests).
3. In Project Settings → API, copy the **Project URL** and the **service_role**
   key (not the `anon` key — the service role key is required so the Netlify
   functions can read/write past Row Level Security, which is enabled with no
   public policies).

## 2. Configure Netlify environment variables

In the Netlify site's Site settings → Environment variables, add (alongside
the existing `ANTHROPIC_API_KEY`):

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

Redeploy after adding them.

## 3. Seed the initial batch of codes

Locally:

```
npm install
SUPABASE_URL=https://xxxx.supabase.co SUPABASE_SERVICE_ROLE_KEY=xxxx npm run generate-codes -- 100
```

This inserts 100 unique `FG-XXXX-XXXX` codes (5 uses each) into Supabase and
writes a `licenses-<timestamp>.csv` file in the current directory — deliver
these codes to Etsy buyers. Don't commit that CSV; `.gitignore` already
excludes `*.csv`.

To generate a different batch size: `npm run generate-codes -- 25`.

## 4. Testing checklist

- Enter a valid code → generates successfully, remaining count decreases
- Generate 5 times → 5th succeeds, remaining shows 0
- Attempt a 6th generation → blocked with the "used all generations" message
  and Etsy link
- Refresh the page / clear `sessionStorage` mid-session → server-side count
  still enforced (re-entering the same code shows the already-reduced count)
- Invalid/made-up code → "We couldn't find that code" message, no access
- "Try Sample" (from the gate screen or the main panel) works without a code
