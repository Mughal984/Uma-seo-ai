const MAX_PAGES = 8;
const MAX_HTML_BYTES = 1_500_000;
const UA = "UmarSEOAI/1.0 (+site-owner-initiated-audit)";

function safeTarget(input, base) {
  const u = new URL(input, base);
  if (!["http:", "https:"].includes(u.protocol) || u.username || u.password) throw new Error("Only public HTTP/HTTPS URLs are allowed.");
  const host = u.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (!host || host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") ||
      /^127\./.test(host) || /^10\./.test(host) || /^192\.168\./.test(host) ||
      /^169\.254\./.test(host) || /^172\.(1[6-9]|2\d|3[01])\./.test(host) ||
      host === "::1" || host.startsWith("fc") || host.startsWith("fd") || host.startsWith("fe80:") ||
      /^\d+$/.test(host)) throw new Error("Local/private network destinations are blocked.");
  u.hash = "";
  return u;
}
async function getPublic(url, origin) {
  const target = safeTarget(url);
  if (target.origin !== origin) throw new Error("Cross-origin requests are blocked.");
  const response = await fetch(target, { redirect: "manual", headers: { "user-agent": UA, "accept": "text/html,text/plain,application/xml;q=0.9,*/*;q=0.1" }, signal: AbortSignal.timeout(9000) });
  if (response.status >= 300 && response.status < 400) {
    const location = response.headers.get("location");
    await response.body?.cancel();
    if (!location) throw new Error("Redirect destination missing.");
    const next = safeTarget(location, target);
    if (next.origin !== origin) throw new Error("Cross-origin redirect blocked.");
    return { response, redirect: next.toString() };
  }
  const length = Number(response.headers.get("content-length") || 0);
  if (length > MAX_HTML_BYTES) { await response.body?.cancel(); throw new Error("Page exceeds size limit."); }
  const text = await response.text();
  if (text.length > MAX_HTML_BYTES) throw new Error("Page exceeds size limit.");
  return { response, text };
}
function firstMatch(html, regex) { return (html.match(regex)?.[1] || "").replace(/&amp;/gi, "&").replace(/&quot;/gi, '"').replace(/&#39;/g, "'").replace(/<[^>]*>/g, "").trim(); }
function count(html, regex) { return [...html.matchAll(regex)].length; }
function visibleText(html) { return html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ").replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ").replace(/&nbsp;|&#160;/gi, " ").replace(/&amp;/gi, "&").replace(/\s+/g, " ").trim(); }
function robotsRules(text) {
  const rules = []; let active = false;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/#.*$/, "").trim(); const m = line.match(/^([^:]+):\s*(.*)$/); if (!m) continue;
    const key = m[1].toLowerCase(), value = m[2].trim();
    if (key === "user-agent") active = value === "*" || /umarseoai/i.test(value);
    else if (active && (key === "allow" || key === "disallow") && value) rules.push({ type: key, path: value });
  }
  return rules;
}
function allowed(path, rules) {
  let winner = null, specificity = -1;
  for (const rule of rules) {
    const pattern = rule.path.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\\\*/g, ".*");
    if (new RegExp("^" + pattern).test(path) && rule.path.length >= specificity) {
      if (rule.path.length > specificity || rule.type === "allow") winner = rule.type;
      specificity = rule.path.length;
    }
  }
  return winner !== "disallow";
}
export async function runSiteAudit(input) {
  const start = safeTarget(input); const origin = start.origin;
  const issues = [], pages = [], queue = [start.toString()], seen = new Set();
  let robots = { status: "not_checked", rules: [] }, sitemap = { status: "not_checked", url: new URL("/sitemap.xml", origin).toString(), urlCount: null };
  try {
    const r = await getPublic(new URL("/robots.txt", origin), origin); robots.status = r.response.status;
    if (r.response.status === 200) {
      robots.rules = robotsRules(r.text);
      const sm = r.text.match(/^\s*sitemap:\s*(\S+)/im); if (sm) sitemap.url = safeTarget(sm[1], origin).toString();
    } else issues.push({ severity: "medium", page: origin + "/robots.txt", issue: "robots.txt unavailable (HTTP " + r.response.status + ")" });
  } catch (e) { robots.status = "fetch_failed"; issues.push({ severity: "warning", page: origin + "/robots.txt", issue: "Could not inspect robots.txt: " + e.message }); }
  try {
    const r = await getPublic(sitemap.url, origin); sitemap.status = r.response.status;
    if (r.response.status === 200) {
      const locs = [...r.text.matchAll(/<loc>\s*([^<]+)\s*<\/loc>/gi)].map(m => m[1].trim());
      sitemap.urlCount = locs.length;
      for (const loc of locs.slice(0, MAX_PAGES * 2)) { try { const u = safeTarget(loc, origin); if (u.origin === origin && !queue.includes(u.toString())) queue.push(u.toString()); } catch {} }
    } else issues.push({ severity: "medium", page: sitemap.url, issue: "Sitemap unavailable (HTTP " + r.response.status + ")" });
  } catch (e) { sitemap.status = "fetch_failed"; issues.push({ severity: "warning", page: sitemap.url, issue: "Could not inspect sitemap: " + e.message }); }
  while (queue.length && pages.length < MAX_PAGES) {
    const url = queue.shift(); if (seen.has(url)) continue; seen.add(url);
    const u = safeTarget(url, origin);
    if (!allowed(u.pathname + u.search, robots.rules)) continue;
    let fetched;
    try { fetched = await getPublic(u, origin); } catch (e) { issues.push({ severity: "warning", page: url, issue: "Fetch failed: " + e.message }); continue; }
    if (fetched.redirect) { issues.push({ severity: "info", page: url, issue: "Redirects to " + fetched.redirect }); continue; }
    const res = fetched.response, html = res.headers.get("content-type")?.includes("text/html") ? fetched.text : "";
    const title = firstMatch(html, /<title\b[^>]*>([\s\S]*?)<\/title>/i);
    const description = firstMatch(html, /<meta\b[^>]*name=["']description["'][^>]*content=["']([^"']*)["'][^>]*>/i) || firstMatch(html, /<meta\b[^>]*content=["']([^"']*)["'][^>]*name=["']description["'][^>]*>/i);
    const h1Count = count(html, /<h1\b/gi), noindex = /<meta\b[^>]*name=["']robots["'][^>]*content=["'][^"']*noindex/i.test(html);
    const missingAlt = [...html.matchAll(/<img\b[^>]*>/gi)].filter(m => !/\balt\s*=/i.test(m[0])).length;
    const canonical = firstMatch(html, /<link\b[^>]*rel=["']canonical["'][^>]*href=["']([^"']+)["'][^>]*>/i);
    const text = visibleText(html), wordCount = text ? text.split(/\s+/).length : 0;
    const page = { url, status: res.status, title, description, h1Count, noindex, imagesMissingAlt: missingAlt, canonical, wordCount, hasViewport: /<meta\b[^>]*name=["']viewport["']/i.test(html), structuredDataBlocks: count(html, /<script\b[^>]*type=["']application\/ld\+json["']/gi) };
    pages.push(page);
    if (res.status >= 400) issues.push({ severity: "high", page: url, issue: "HTTP status " + res.status });
    if (html) {
      if (!title) issues.push({ severity: "high", page: url, issue: "Missing page title" });
      if (!description) issues.push({ severity: "medium", page: url, issue: "Missing meta description" });
      if (!h1Count) issues.push({ severity: "medium", page: url, issue: "Missing H1 heading" });
      if (h1Count > 1) issues.push({ severity: "low", page: url, issue: "Multiple H1 headings (" + h1Count + ")" });
      if (noindex) issues.push({ severity: "high", page: url, issue: "Page has noindex directive" });
      if (missingAlt) issues.push({ severity: "low", page: url, issue: missingAlt + " image(s) missing alt text" });
      if (!canonical) issues.push({ severity: "medium", page: url, issue: "Missing canonical link element" });
      else { try { if (safeTarget(canonical, url).origin !== origin) issues.push({ severity: "high", page: url, issue: "Canonical points to a different origin" }); } catch { issues.push({ severity: "medium", page: url, issue: "Canonical URL is malformed" }); } }
      if (!page.hasViewport) issues.push({ severity: "medium", page: url, issue: "Missing mobile viewport meta tag" });
      if (wordCount < 100) issues.push({ severity: "info", page: url, issue: "Page has fewer than 100 visible words" });
      for (const m of html.matchAll(/<a\b[^>]*href=["']([^"'#]+)["'][^>]*>/gi)) { try { const link = safeTarget(m[1], url); if (link.origin === origin && queue.length < 30 && !seen.has(link.toString()) && !queue.includes(link.toString())) queue.push(link.toString()); } catch {} }
    }
  }
  const counts = { high: 0, medium: 0, low: 0, warning: 0, info: 0 };
  for (const issue of issues) counts[issue.severity] = (counts[issue.severity] || 0) + 1;
  return { website: start.toString().replace(/\/$/, ""), scannedAt: new Date().toISOString(), pagesScanned: pages.length, pageLimit: MAX_PAGES, counts, robots: { status: robots.status, rulesCount: robots.rules.length }, sitemap, pages, issues, limitations: ["Cloudflare Worker crawler is capped at 8 pages per audit.", "Redirects are not followed automatically; cross-origin redirects are blocked.", "Keyword volumes, rankings, backlink metrics, competitor data and Core Web Vitals are not measured.", "HTML metadata extraction is lightweight and is not a full browser render."] };
}
