function send(res, statusCode, body) {
  res.status(statusCode).setHeader("Content-Type", "application/json");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(body));
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
  return { stage, ...extra };
}

async function readBody(req) {
  if (typeof req.body === "string") {
    return JSON.parse(req.body || "{}");
  }

  if (req.body && typeof req.body === "object") {
    return req.body;
  }

  return await new Promise((resolve, reject) => {
    let raw = "";

    req.on("data", (chunk) => {
      raw += chunk;
    });

    req.on("end", () => {
      try {
        resolve(JSON.parse(raw || "{}"));
      } catch (error) {
        reject(error);
      }
    });

    req.on("error", reject);
  });
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    send(res, 405, { error: "Method not allowed" });
    return;
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const supabaseTable = process.env.SUPABASE_TABLE || "lotto_draws";

  if (!supabaseUrl || !supabaseServiceRoleKey) {
    send(res, 500, {
      error: "Supabase env vars are not configured",
      debug: buildDebug("env", {
        hasUrl: Boolean(supabaseUrl),
        hasServiceRoleKey: Boolean(supabaseServiceRoleKey),
        table: supabaseTable,
      }),
    });
    return;
  }

  let payload;

  try {
    payload = await readBody(req);
  } catch {
    send(res, 400, { error: "Invalid JSON body", debug: buildDebug("parse-body") });
    return;
  }

  if (!Array.isArray(payload.numbers) || payload.numbers.length !== 6) {
    send(res, 400, {
      error: "numbers must be an array of 6 values",
      debug: buildDebug("validate-numbers", {
        receivedType: typeof payload.numbers,
        receivedLength: payload.numbers?.length,
      }),
    });
    return;
  }

  const numbers = payload.numbers.map((value) => Number(value)).filter(Number.isFinite);

  if (numbers.length !== 6) {
    send(res, 400, {
      error: "numbers must contain valid numeric values",
      debug: buildDebug("validate-numeric", { original: payload.numbers }),
    });
    return;
  }

  const row = { numbers };

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

      send(res, response.status, {
        error: message || "Supabase insert failed",
        debug,
      });
      return;
    }

    send(res, 200, {
      ok: true,
      id: Array.isArray(responseBody) ? responseBody?.[0]?.id ?? null : null,
      debug,
    });
  } catch (error) {
    send(res, 500, {
      error: toMessage(error) || "Supabase request failed",
      debug: buildDebug("fetch-exception", {
        name: error?.name,
        stack: error?.stack?.split("\n").slice(0, 4),
      }),
    });
  }
}
