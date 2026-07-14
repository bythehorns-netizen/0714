function json(statusCode, body) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
    body: JSON.stringify(body),
  };
}

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return json(405, { error: "Method not allowed" });
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const supabaseTable = process.env.SUPABASE_TABLE || "lotto_draws";

  if (!supabaseUrl || !supabaseServiceRoleKey) {
    return json(500, { error: "Supabase env vars are not configured" });
  }

  let payload;

  try {
    payload = JSON.parse(event.body || "{}");
  } catch {
    return json(400, { error: "Invalid JSON body" });
  }

  if (!Array.isArray(payload.numbers) || payload.numbers.length !== 6) {
    return json(400, { error: "numbers must be an array of 6 values" });
  }

  const numbers = payload.numbers.map((value) => Number(value)).filter(Number.isFinite);

  if (numbers.length !== 6) {
    return json(400, { error: "numbers must contain valid numeric values" });
  }

  const response = await fetch(`${supabaseUrl.replace(/\/$/, "")}/rest/v1/${supabaseTable}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${supabaseServiceRoleKey}`,
      apikey: supabaseServiceRoleKey,
      Prefer: "return=representation",
    },
    body: JSON.stringify([{ numbers }]),
  });

  if (!response.ok) {
    const message = await response.text();
    return json(response.status, { error: message || "Supabase insert failed" });
  }

  const data = await response.json();
  return json(200, { ok: true, id: data?.[0]?.id ?? null });
};
