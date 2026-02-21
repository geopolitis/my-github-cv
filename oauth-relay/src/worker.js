export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders(request) });
    }

    if (request.method === "GET" && url.pathname === "/health") {
      return json({ ok: true }, 200, request);
    }

    if (request.method === "POST" && url.pathname === "/oauth/device/code") {
      return proxyFormRequest({
        request,
        targetUrl: "https://github.com/login/device/code",
        env,
        includeClientSecret: false,
      });
    }

    if (request.method === "POST" && url.pathname === "/oauth/device/token") {
      return proxyFormRequest({
        request,
        targetUrl: "https://github.com/login/oauth/access_token",
        env,
        includeClientSecret: true,
      });
    }

    return json({ error: "not_found" }, 404, request);
  },
};

async function proxyFormRequest({ request, targetUrl, env, includeClientSecret }) {
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return json({ error: "invalid_json" }, 400, request);
  }

  const clientId = String(body.client_id || "").trim();
  const scope = String(body.scope || "").trim();
  const deviceCode = String(body.device_code || "").trim();
  const grantType = String(body.grant_type || "").trim();

  if (!clientId) {
    return json({ error: "missing_client_id" }, 400, request);
  }

  if (includeClientSecret && !env.GITHUB_CLIENT_SECRET) {
    return json({ error: "missing_server_secret" }, 500, request);
  }

  const params = new URLSearchParams();
  params.set("client_id", clientId);
  if (scope) params.set("scope", scope);
  if (deviceCode) params.set("device_code", deviceCode);
  if (grantType) params.set("grant_type", grantType);
  if (includeClientSecret && env.GITHUB_CLIENT_SECRET) {
    params.set("client_secret", env.GITHUB_CLIENT_SECRET);
  }

  const githubRes = await fetch(targetUrl, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent": "my-github-cv-oauth-relay",
    },
    body: params.toString(),
  });

  const payload = await githubRes.text();
  const headers = {
    ...corsHeaders(request),
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
  };

  return new Response(payload, { status: githubRes.status, headers });
}

function json(data, status, request) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...corsHeaders(request),
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });
}

function corsHeaders(request) {
  const origin = request.headers.get("Origin") || "*";
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type,Authorization",
    Vary: "Origin",
  };
}
