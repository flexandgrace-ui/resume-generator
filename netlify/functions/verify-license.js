const { getSupabaseClient, CODE_RE, normalizeCode, json } = require('./_lib/supabase');

exports.handler = async function(event) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  let code;
  try {
    ({ code } = JSON.parse(event.body));
  } catch (e) {
    return json(400, { valid: false, error: 'Malformed request' });
  }

  code = normalizeCode(code);
  if (!CODE_RE.test(code)) {
    return json(200, { valid: false, error: 'That code doesn’t look right. Check the format: FG-XXXX-XXXX.' });
  }

  try {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from('licenses')
      .select('uses_remaining, max_uses')
      .eq('code', code)
      .maybeSingle();

    if (error) throw error;

    if (!data) {
      return json(200, { valid: false, error: 'We couldn’t find that code.' });
    }

    if (data.uses_remaining <= 0) {
      return json(200, {
        valid: false,
        error: 'This code has no generations remaining.',
        usesRemaining: 0,
        maxUses: data.max_uses
      });
    }

    return json(200, { valid: true, usesRemaining: data.uses_remaining, maxUses: data.max_uses });
  } catch (err) {
    return json(500, { valid: false, error: 'Server error, please try again.' });
  }
};
