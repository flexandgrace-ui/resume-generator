const { getSupabaseClient, json } = require('./_lib/supabase');
const { sendLowSupplyAlert } = require('./_lib/alert');

// Called by the Zapier "New Etsy order" Zap. Claims the oldest unassigned
// license code and hands it back for delivery to the buyer. Optionally
// accepts an orderId/email for logging/alerting context — neither is
// required or validated.
exports.handler = async function(event) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  let orderId, email;
  try {
    const body = event.body ? JSON.parse(event.body) : {};
    orderId = body.orderId;
    email = body.email;
  } catch (e) {
    // Input is optional — ignore malformed/empty bodies rather than erroring.
  }

  try {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase.rpc('assign_next_license').maybeSingle();

    if (error) throw error;

    if (!data || !data.assigned || !data.code) {
      console.error('assign-next-code: no unassigned license codes available.', { orderId, email });
      await sendLowSupplyAlert({ reason: 'zero_supply', orderId, email });
      return json(503, {
        success: false,
        error: 'No license codes are available right now. Ken has been alerted.'
      });
    }

    return json(200, { success: true, code: data.code });
  } catch (err) {
    console.error('assign-next-code failed:', err);
    return json(500, { success: false, error: 'Server error, please try again.' });
  }
};
