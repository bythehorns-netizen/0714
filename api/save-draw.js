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

function toMessage(value) {
  if (typeof value === "string") return value;
  if (value instanceof Error) return value.message;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
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

  const row = {
    numbers,
  };

  try {
    const response = await fetch(`${supabaseUrl.replace(/\/$/, "")}/rest/v1/${supabaseTable}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${supabaseServiceRoleKey}`,
        apikey: supabaseServiceRoleKey,
        Prefer: "return=representation",
      },
      body: JSON.stringify([row]),
    });

    const rawBody = await response.text();
    const isJson = (response.headers.get("content-type") || "").includes("application/json");
    const payload = isJson ? JSON.parse(rawBody || "[]") : rawBody;

    if (!response.ok) {
      const message = isJson
        ? payload?.message || payload?.error || payload?.details || rawBody
        : rawBody;
      return json(response.status, { error: message || "Supabase insert failed" });
    }

    return json(200, { ok: true, id: Array.isArray(payload) ? payload?.[0]?.id ?? null : null });
  } catch (error) {
    return json(500, { error: toMessage(error) || "Supabase request failed" });
  }
};
