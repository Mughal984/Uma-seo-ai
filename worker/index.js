import bcrypt from "bcryptjs";

const JSON_HEADERS = { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" };
const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: JSON_HEADERS });
const fail = (message, status = 400) => json({ error: message }, status);
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function base64url(input) {
  const bytes = typeof input === "string" ? new TextEncoder().encode(input) : input;
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}
function decodeBase64url(value) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(normalized + "=".repeat((4 - normalized.length % 4) % 4));
  return Uint8Array.from(binary, char => char.charCodeAt(0));
}
async function signToken(user, secret) {
  const header = base64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payload = base64url(JSON.stringify({ sub: String(user.id), email: user.email, iat: Math.floor(Date.now()/1000), exp: Math.floor(Date.now()/1000) + 60*60*24*7 }));
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(header + "." + payload));
  return header + "." + payload + "." + base64url(new Uint8Array(signature));
}
async function verifyToken(token, secret) {
  const parts = String(token || "").split(".");
  if (parts.length !== 3) return null;
  let payload;
  try { payload = JSON.parse(new TextDecoder().decode(decodeBase64url(parts[1]))); } catch { return null; }
  if (!payload.sub || !payload.exp || payload.exp <= Math.floor(Date.now()/1000)) return null;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["verify"]);
  const valid = await crypto.subtle.verify("HMAC", key, decodeBase64url(parts[2]), new TextEncoder().encode(parts[0] + "." + parts[1]));
  return valid ? payload : null;
}
async function bodyJson(request) {
  try { return await request.json(); } catch { return null; }
}
function normalizeWebsite(value) {
  let url;
  try { url = new URL(String(value || "")); } catch { throw new Error("Enter a valid website URL."); }
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) throw new Error("Only public HTTP/HTTPS website URLs are allowed.");
  if (url.hostname === "localhost" || url.hostname.endsWith(".localhost") || url.hostname.endsWith(".local") || url.hostname === "127.0.0.1" || url.hostname === "::1") throw new Error("Local website addresses are blocked.");
  url.hash = "";
  return url.toString().replace(/\/$/, "");
}
async function authenticate(request, env) {
  const token = (request.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (!token) return null;
  const payload = await verifyToken(token, env.JWT_SECRET);
  if (!payload) return null;
  return await env.DB.prepare("SELECT id,email,created_at FROM users WHERE id=?").bind(Number(payload.sub)).first();
}
async function route(request, env) {
  const url = new URL(request.url);
  const path = url.pathname;
  if (request.method === "GET" && path === "/api/health") {
    const result = await env.DB.prepare("SELECT 1 AS ok").first();
    return json({ status: "ok", runtime: "cloudflare-workers", database: result?.ok === 1 ? "connected" : "unknown", timestamp: new Date().toISOString() });
  }
  if (request.method === "POST" && path === "/api/register") {
    const data = await bodyJson(request);
    if (!data || typeof data.email !== "string" || typeof data.password !== "string") return fail("Email and password are required.");
    const email = data.email.trim().toLowerCase();
    if (!emailPattern.test(email) || email.length > 254) return fail("Enter a valid email address.");
    if (data.password.length < 10 || data.password.length > 200) return fail("Password must be 10–200 characters.");
    const existing = await env.DB.prepare("SELECT id FROM users WHERE email=?").bind(email).first();
    if (existing) return fail("An account with this email already exists.", 409);
    const hash = await bcrypt.hash(data.password, 10);
    const inserted = await env.DB.prepare("INSERT INTO users(email,password_hash) VALUES(?,?)").bind(email, hash).run();
    const user = { id: inserted.meta.last_row_id, email };
    return json({ token: await signToken(user, env.JWT_SECRET), user }, 201);
  }
  if (request.method === "POST" && path === "/api/login") {
    const data = await bodyJson(request);
    if (!data || typeof data.email !== "string" || typeof data.password !== "string") return fail("Email and password are required.");
    const user = await env.DB.prepare("SELECT id,email,password_hash FROM users WHERE email=?").bind(data.email.trim().toLowerCase()).first();
    if (!user || !(await bcrypt.compare(data.password, user.password_hash))) return fail("Invalid email or password.", 401);
    return json({ token: await signToken(user, env.JWT_SECRET), user: { id: user.id, email: user.email } });
  }
  const user = await authenticate(request, env);
  if (!user) return fail("Authentication required.", 401);
  if (request.method === "GET" && path === "/api/me") return json({ user });
  if (request.method === "GET" && path === "/api/projects") {
    const { results } = await env.DB.prepare("SELECT id,name,url,created_at FROM projects WHERE user_id=? ORDER BY id DESC").bind(user.id).all();
    return json({ projects: results || [] });
  }
  if (request.method === "POST" && path === "/api/projects") {
    const data = await bodyJson(request);
    if (!data || typeof data.name !== "string" || !data.name.trim() || data.name.length > 120) return fail("Project name is required (max 120 characters).");
    let website;
    try { website = normalizeWebsite(data.url); } catch (error) { return fail(error.message); }
    const inserted = await env.DB.prepare("INSERT INTO projects(user_id,name,url) VALUES(?,?,?)").bind(user.id, data.name.trim(), website).run();
    return json({ project: { id: inserted.meta.last_row_id, name: data.name.trim(), url: website } }, 201);
  }
  if (request.method === "GET" && path === "/api/tasks") {
    const { results } = await env.DB.prepare("SELECT t.id,t.project_id,t.audit_id,t.task_key,t.action_json,t.status,t.created_at,t.updated_at FROM seo_tasks t JOIN projects p ON p.id=t.project_id WHERE p.user_id=? ORDER BY t.id DESC LIMIT 200").bind(user.id).all();
    return json({ tasks: (results || []).map(task => ({ ...task, action: JSON.parse(task.action_json) })) });
  }
  const taskMatch = path.match(/^\/api\/tasks\/(\d+)$/);
  if (request.method === "PATCH" && taskMatch) {
    const data = await bodyJson(request);
    if (!data || !["approved", "dismissed"].includes(data.status)) return fail("Status must be approved or dismissed.");
    const result = await env.DB.prepare("UPDATE seo_tasks SET status=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND project_id IN (SELECT id FROM projects WHERE user_id=?)").bind(data.status, Number(taskMatch[1]), user.id).run();
    if (!result.meta.changes) return fail("Task not found.", 404);
    return json({ success: true, status: data.status, note: "Approval records intent only; it does not publish changes to the website." });
  }
  return fail("Route not found.", 404);
}

export default {
  async fetch(request, env) {
    try {
      if (!env.DB) return fail("D1 database binding DB is missing.", 503);
      if (!env.JWT_SECRET || env.JWT_SECRET.length < 32) return fail("JWT_SECRET must be configured with at least 32 characters.", 503);
      return await route(request, env);
    } catch (error) {
      console.error("UMA SEO AI Worker error:", error);
      return fail("Internal server error.", 500);
    }
  }
};
