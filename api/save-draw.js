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

function buildDebug(stage, extra = {}) {
  return {
    stage,
    ...extra,
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
    return json(500, {
      error: "Supabase env vars are not configured",
      debug: buildDebug("env", {
        hasUrl: Boolean(supabaseUrl),
        hasServiceRoleKey: Boolean(supabaseServiceRoleKey),
        table: supabaseTable,
      }),
    });
  }

  let payload;

  try {
    payload = JSON.parse(event.body || "{}");
  } catch {
    return json(400, { error: "Invalid JSON body", debug: buildDebug("parse-body") });
  }

  if (!Array.isArray(payload.numbers) || payload.numbers.length !== 6) {
    return json(400, {
      error: "numbers must be an array of 6 values",
      debug: buildDebug("validate-numbers", { receivedType: typeof payload.numbers, receivedLength: payload.numbers?.length }),
    });
  }

  const numbers = payload.numbers.map((value) => Number(value)).filter(Number.isFinite);

  if (numbers.length !== 6) {
    return json(400, {
      error: "numbers must contain valid numeric values",
      debug: buildDebug("validate-numeric", { original: payload.numbers }),
    });
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
    const responseBody = isJson ? JSON.parse(rawBody || "[]") : rawBody;
    const debug = buildDebug("supabase-response", {
      status: response.status,
      ok: response.ok,
      contentType: response.headers.get("content-type") || "",
      bodyPreview: rawBody.slice(0, 400),
      request: {
        table: supabaseTable,
        rowKeys: Object.keys(row),
        numbersLength: numbers.length,
      },
    });

    if (!response.ok) {
      const message = isJson
        ? responseBody?.message || responseBody?.error || responseBody?.details || rawBody
        : rawBody;
      return json(response.status, {
        error: message || "Supabase insert failed",
        debug,
      });
    }

    return json(200, {
      ok: true,
      id: Array.isArray(responseBody) ? responseBody?.[0]?.id ?? null : null,
      debug,
    });
  } catch (error) {
    return json(500, {
      error: toMessage(error) || "Supabase request failed",
      debug: buildDebug("fetch-exception", {
        name: error?.name,
        stack: error?.stack?.split("\n").slice(0, 4),
      }),
    });
  }
};
