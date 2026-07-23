#!/usr/bin/env node
// Bulk-generates unique license codes and seeds them into Supabase.
//
// Usage:
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/generate-codes.js [count]
//
// Writes a CSV of the newly created codes (for delivery via Etsy) into the
// current directory.

const fs = require('fs');
const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');

// Excludes visually ambiguous characters (0/O, 1/I/L).
const CHARSET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const SEGMENT_LEN = 4;
const MAX_USES = 5;

function randomSegment() {
  const bytes = crypto.randomBytes(SEGMENT_LEN);
  let out = '';
  for (let i = 0; i < SEGMENT_LEN; i++) {
    out += CHARSET[bytes[i] % CHARSET.length];
  }
  return out;
}

function generateCode() {
  return `FG-${randomSegment()}-${randomSegment()}`;
}

async function main() {
  const count = parseInt(process.argv[2] || '100', 10);
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in the environment.');
    process.exit(1);
  }

  const supabase = createClient(url, key);

  const codes = new Set();
  while (codes.size < count) {
    codes.add(generateCode());
  }
  const rows = [...codes].map(code => ({ code, max_uses: MAX_USES, uses_remaining: MAX_USES }));

  const { data, error } = await supabase.from('licenses').insert(rows).select('code');
  if (error) {
    console.error('Insert failed:', error.message);
    process.exit(1);
  }

  const outPath = `licenses-${Date.now()}.csv`;
  fs.writeFileSync(outPath, 'code\n' + data.map(r => r.code).join('\n') + '\n');

  console.log(`Inserted ${data.length} codes into Supabase.`);
  console.log(`Saved to ${outPath}`);
}

main();
