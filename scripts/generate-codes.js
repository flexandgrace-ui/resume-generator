#!/usr/bin/env node
// Bulk-generates unique license codes and seeds them into Supabase.
//
// Usage:
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/generate-codes.js [count]
//
// Writes a CSV of the newly created codes (for delivery via Etsy) into the
// current directory.

const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');
const { generateAndInsertCodes } = require('../lib/codes');

async function main() {
  const count = parseInt(process.argv[2] || '100', 10);
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in the environment.');
    process.exit(1);
  }

  const supabase = createClient(url, key);

  let data;
  try {
    data = await generateAndInsertCodes(supabase, count);
  } catch (error) {
    console.error('Insert failed:', error.message);
    process.exit(1);
  }

  const outPath = `licenses-${Date.now()}.csv`;
  fs.writeFileSync(outPath, 'code\n' + data.map(r => r.code).join('\n') + '\n');

  console.log(`Inserted ${data.length} codes into Supabase.`);
  console.log(`Saved to ${outPath}`);
}

main();
