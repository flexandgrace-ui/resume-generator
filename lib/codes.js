// Shared license code generation logic, used by scripts/generate-codes.js
// (manual bulk seeding) and netlify/functions/check-code-supply.js
// (automatic replenishment).

const crypto = require('crypto');

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

// Generates `count` unique codes and inserts them into `licenses` as
// unassigned. Returns the inserted rows (as returned by Supabase).
async function generateAndInsertCodes(supabase, count) {
  const codes = new Set();
  while (codes.size < count) {
    codes.add(generateCode());
  }
  const rows = [...codes].map(code => ({
    code,
    max_uses: MAX_USES,
    uses_remaining: MAX_USES,
    assigned: false
  }));

  const { data, error } = await supabase.from('licenses').insert(rows).select('code');
  if (error) throw error;
  return data;
}

module.exports = { generateCode, generateAndInsertCodes, MAX_USES };
