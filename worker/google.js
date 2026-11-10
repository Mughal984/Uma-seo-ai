const enc = new TextEncoder();
const dec = new TextDecoder();
const JSON_HEADERS = { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" };
const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: JSON_HEADERS });
const fail = (message, status = 400) => json({ error: message }, status);
const SCOPES = [
  "https://www.googleapis.com/auth/webmasters.readonly",
  "https://www.googleapis.com/auth/analytics.readonly"
];

function b64url(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/=/g, "").replaceAll("+", "-").replaceAll("/", "_");
}
function fromB64url(value) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(normalized + "=".repeat((4 - normalized.length % 4) % 4));
  return Uint8Array.from(binary, c => c.charCodeAt(0));
}
function randomHex(bytes = 32) {
  const data = crypto.getRandomValues(new Uint8Array(bytes));
  return [...data].map(x => x.toString(16).padStart(2, "0")).join("");
}
function googleConfig(request, env) {
  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET || !env.GOOGLE_TOKEN_ENCRYPTION_KEY || !env.PUBLIC_BASE_URL) {
    throw new Error("Google OAuth is not configured. Add GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_TOKEN_ENCRYPTION_KEY and PUBLIC_BASE_URL Worker secrets/variables.");
  }
  if (!/^[a-f0-9]{64}$/i.test(env.GOOGLE_TOKEN_ENCRYPTION_KEY)) throw new Error("GOOGLE_TOKEN_ENCRYPTION_KEY must be exactly 64 hexadecimal characters.");
  const base = new URL(env.PUBLIC_BASE_URL);
  if (base.protocol !== "https:" || base.origin !== new URL(request.url).origin) throw new Error("PUBLIC_BASE_URL must be the exact HTTPS URL of this deployed Worker.");
  return { clientId: env.GOOGLE_CLIENT_ID, clientSecret: env.GOOGLE_CLIENT_SECRET, redirectUri: new URL("/api/google/callback", base).toString() };
}
async function stateKey(secret) {
  return crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}
export async function signState(payload, secret) {
  const header = b64url(enc.encode(JSON.stringify({ alg: "HS256", typ: "JWT" })));
  const body = b64url(enc.encode(JSON.stringify(payload)));
  const input = header + "." + body;
  const signature = await crypto.subtle.sign("HMAC", await stateKey(secret), enc.encode(input));
  return input + "." + b64url(new Uint8Array(signature));
}
export async function verifyState(token, secret) {
  const parts = String(token || "").split(".");
  if (parts.length !== 3) return null;
  let header, payload;
  try { header = JSON.parse(dec.decode(fromB64url(parts[0]))); payload = JSON.parse(dec.decode(fromB64url(parts[1]))); } catch { return null; }
  if (header.alg !== "HS256" || payload.iss !== "umar-seo-ai-google" || !payload.uid || !payload.nonce || !Number.isFinite(payload.exp) || payload.exp <= Math.floor(Date.now()/1000)) return null;
  const valid = await crypto.subtle.verify("HMAC", await stateKey(secret), fromB64url(parts[2]), enc.encode(parts[0] + "." + parts[1]));
  return valid ? payload : null;
}
async function encryptionKey(hex) {
  const raw = Uint8Array.from(hex.match(/.{2}/g), x => parseInt(x, 16));
  return crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt", "decrypt"]);
}
export async function encryptToken(token, hex) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await encryptionKey(hex), enc.encode(token));
  return "v1." + b64url(iv) + "." + b64url(new Uint8Array(ciphertext));
}
export async function decryptToken(value, hex) {
  const [version, iv, ciphertext] = String(value).split(".");
  if (version !== "v1" || !iv || !ciphertext) throw new Error("Stored Google token format is invalid. Reconnect Google.");
  const clear = await crypto.subtle.decrypt({ name: "AES-GCM", iv: fromB64url(iv) }, await encryptionKey(hex), fromB64url(ciphertext));
  return dec.decode(clear);
}
async function exchangeToken(body) {
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(body), signal: AbortSignal.timeout(15000)
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error("Google token exchange failed (" + response.status + "). Check OAuth credentials and redirect URI.");
  return data;
}
async function accessToken(userId, env, cfg) {
  const row = await env.DB.prepare("SELECT refresh_token_enc FROM google_connections WHERE user_id=?").bind(userId).first();
  if (!row) throw new Error("Google account is not connected.");
  const refreshToken = await decryptToken(row.refresh_token_enc, env.GOOGLE_TOKEN_ENCRYPTION_KEY);
  const data = await exchangeToken({ client_id: cfg.clientId, client_secret: cfg.clientSecret, refresh_token: refreshToken, grant_type: "refresh_token" });
  if (!data.access_token) throw new Error("Google authorization expired or was revoked. Disconnect and reconnect Google.");
  return data.access_token;
}
async function googleApi(userId, env, cfg, url, options = {}) {
  const token = await accessToken(userId, env, cfg);
  const response = await fetch(url, {
    ...options, headers: { authorization: "Bearer " + token, "content-type": "application/json", ...(options.headers || {}) },
    signal: AbortSignal.timeout(20000)
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error("Google API request failed (" + response.status + "). Confirm the relevant Google API is enabled and this account can access the property.");
  return data;
}
const validDates = (start, end) => /^\\d{4}-\\d{2}-\\d{2}$/.test(start || "") && /^\\d{4}-\\d{2}-\\d{2}$/.test(end || "") && start <= end;

export async function handleGoogleRoute(request, env, user) {
  const url = new URL(request.url), path = url.pathname, method = request.method;
  const isCallback = method === "GET" && path === "/api/google/callback";
  const isGooglePath = path.startsWith("/api/google/");
  if (!isGooglePath) return null;

  if (isCallback) {
    let cfg;
    try {
      cfg = googleConfig(request, env);
      if (url.searchParams.has("error")) return Response.redirect(new URL("/?google=denied", cfg.redirectUri).origin + "/?google=denied", 302);
      const payload = await verifyState(url.searchParams.get("state"), env.JWT_SECRET);
      const code = url.searchParams.get("code");
      if (!payload || !code || code.length > 4096) return Response.redirect(new URL("/?google=invalid", cfg.redirectUri), 302);
      const saved = await env.DB.prepare("SELECT user_id,expires_at FROM google_oauth_states WHERE nonce=?").bind(payload.nonce).first();
      const consumed = await env.DB.prepare("DELETE FROM google_oauth_states WHERE nonce=? AND user_id=? AND expires_at>=?").bind(payload.nonce, payload.uid, Date.now()).run();
      if (!saved || Number(saved.user_id) !== Number(payload.uid) || !consumed.meta.changes) return Response.redirect(new URL("/?google=expired", cfg.redirectUri), 302);
      const tokens = await exchangeToken({ code, client_id: cfg.clientId, client_secret: cfg.clientSecret, redirect_uri: cfg.redirectUri, grant_type: "authorization_code" });
      const existing = await env.DB.prepare("SELECT refresh_token_enc FROM google_connections WHERE user_id=?").bind(payload.uid).first();
      const encrypted = tokens.refresh_token ? await encryptToken(tokens.refresh_token, env.GOOGLE_TOKEN_ENCRYPTION_KEY) : existing?.refresh_token_enc;
      if (!encrypted) return Response.redirect(new URL("/?google=missing_refresh", cfg.redirectUri), 302);
      await env.DB.prepare("INSERT INTO google_connections(user_id,refresh_token_enc) VALUES(?,?) ON CONFLICT(user_id) DO UPDATE SET refresh_token_enc=excluded.refresh_token_enc,updated_at=CURRENT_TIMESTAMP").bind(payload.uid, encrypted).run();
      return Response.redirect(new URL("/?google=connected", cfg.redirectUri), 302);
    } catch (error) {
      console.error("Google OAuth callback error:", String(error.message || error).slice(0, 250));
      const base = env.PUBLIC_BASE_URL || new URL(request.url).origin;
      return Response.redirect(new URL("/?google=error", base), 302);
    }
  }

  if (!user) return fail("Authentication required.", 401);
  if (method === "POST" && path === "/api/google/connect") {
    try {
      const cfg = googleConfig(request, env);
      const nonce = randomHex(32), expiresAt = Date.now() + 10 * 60 * 1000;
      await env.DB.prepare("INSERT INTO google_oauth_states(nonce,user_id,expires_at) VALUES(?,?,?)").bind(nonce, user.id, expiresAt).run();
      const state = await signState({ uid: user.id, nonce, iss: "umar-seo-ai-google", iat: Math.floor(Date.now()/1000), exp: Math.floor(expiresAt/1000) }, env.JWT_SECRET);
      const params = new URLSearchParams({ client_id: cfg.clientId, redirect_uri: cfg.redirectUri, response_type: "code", scope: SCOPES.join(" "), access_type: "offline", include_granted_scopes: "true", prompt: "consent", state });
      return json({ authorizationUrl: "https://accounts.google.com/o/oauth2/v2/auth?" + params.toString() });
    } catch (error) { return fail(error.message, 503); }
  }
  if (method === "GET" && path === "/api/google/status") {
    const row = await env.DB.prepare("SELECT created_at,updated_at FROM google_connections WHERE user_id=?").bind(user.id).first();
    return json({ connected: !!row, connectedAt: row?.created_at || null });
  }
  if (method === "DELETE" && path === "/api/google/connection") {
    await env.DB.prepare("DELETE FROM google_connections WHERE user_id=?").bind(user.id).run();
    return json({ connected: false });
  }
  if (method === "GET" && path === "/api/google/search-console/sites") {
    try { const cfg = googleConfig(request, env); const data = await googleApi(user.id, env, cfg, "https://www.googleapis.com/webmasters/v3/sites"); return json({ sites: data.siteEntry || [] }); }
    catch (error) { return fail(error.message, 502); }
  }
  if (method === "GET" && path === "/api/google/analytics/properties") {
    try {
      const cfg = googleConfig(request, env), data = await googleApi(user.id, env, cfg, "https://analyticsadmin.googleapis.com/v1beta/accountSummaries?pageSize=200");
      const properties = (data.accountSummaries || []).flatMap(a => (a.propertySummaries || []).map(p => ({ property: p.property, displayName: p.displayName, account: a.displayName })));
      return json({ properties, nextPageToken: data.nextPageToken || null });
    } catch (error) { return fail(error.message, 502); }
  }
  if (method === "GET" && path === "/api/google/search-console/performance") {
    try {
      const siteUrl = url.searchParams.get("siteUrl") || "", startDate = url.searchParams.get("startDate") || "", endDate = url.searchParams.get("endDate") || "";
      if (!siteUrl || siteUrl.length > 2048 || !validDates(startDate, endDate)) return fail("Provide siteUrl, startDate and endDate in YYYY-MM-DD format.");
      const cfg = googleConfig(request, env), sites = await googleApi(user.id, env, cfg, "https://www.googleapis.com/webmasters/v3/sites");
      if (!(sites.siteEntry || []).some(s => s.siteUrl === siteUrl)) return fail("This Search Console property is not available to the connected Google account.", 403);
      const data = await googleApi(user.id, env, cfg, "https://www.googleapis.com/webmasters/v3/sites/" + encodeURIComponent(siteUrl) + "/searchAnalytics/query", { method: "POST", body: JSON.stringify({ startDate, endDate, dimensions: ["query"], rowLimit: 100 }) });
      return json({ siteUrl, startDate, endDate, rows: data.rows || [] });
    } catch (error) { return fail(error.message, 502); }
  }
  if (method === "GET" && path === "/api/google/analytics/report") {
    try {
      const propertyId = url.searchParams.get("propertyId") || "", startDate = url.searchParams.get("startDate") || "", endDate = url.searchParams.get("endDate") || "";
      if (!/^\\d+$/.test(propertyId) || !validDates(startDate, endDate)) return fail("Provide a numeric propertyId and dates in YYYY-MM-DD format.");
      const cfg = googleConfig(request, env), accounts = await googleApi(user.id, env, cfg, "https://analyticsadmin.googleapis.com/v1beta/accountSummaries?pageSize=200");
      const allowed = (accounts.accountSummaries || []).some(a => (a.propertySummaries || []).some(p => p.property === "properties/" + propertyId));
      if (!allowed) return fail("This Analytics property is not available to the connected Google account.", 403);
      const data = await googleApi(user.id, env, cfg, "https://analyticsdata.googleapis.com/v1beta/properties/" + propertyId + ":runReport", { method: "POST", body: JSON.stringify({ dateRanges: [{ startDate, endDate }], dimensions: [{ name: "date" }], metrics: [{ name: "activeUsers" }, { name: "sessions" }, { name: "screenPageViews" }], limit: 1000 }) });
      return json({ propertyId, startDate, endDate, rows: data.rows || [], totals: data.totals || [] });
    } catch (error) { return fail(error.message, 502); }
  }
  return fail("Google route not found.", 404);
}
