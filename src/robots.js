const BOT = "umarseoai";

function wildcardPattern(value) {
  const anchored = value.endsWith("$");
  const body = anchored ? value.slice(0, -1) : value;
  const escaped = body.replace(/[.+?^${}()|[\\]\\\\]/g, "\\\\$&").replace(/\\*/g, ".*");
  return new RegExp("^" + escaped + (anchored ? "" : ".*") + "$");
}

export function parseRobotsTxt(source = "", userAgent = BOT) {
  const groups = [];
  const sitemaps = [];
  let group = null;
  let hasDirective = false;

  for (const raw of String(source).split(/\r?\n/)) {
    const line = raw.replace(/#.*$/, "").trim();
    if (!line) continue;
    const separator = line.indexOf(":");
    if (separator < 1) continue;
    const key = line.slice(0, separator).trim().toLowerCase();
    const value = line.slice(separator + 1).trim();
    if (key === "sitemap") {
      if (value) sitemaps.push(value);
      continue;
    }
    if (key === "user-agent") {
      if (!group || hasDirective) {
        group = { agents: [], rules: [] };
        groups.push(group);
        hasDirective = false;
      }
      if (value) group.agents.push(value.toLowerCase());
      continue;
    }
    if (!group) continue;
    if (key === "allow" || key === "disallow") {
      if (value) group.rules.push({ type: key, path: value });
      hasDirective = true;
    }
  }

  const normalizedAgent = String(userAgent).toLowerCase();
  const specific = groups.filter(item => item.agents.some(agent => agent !== "*" && normalizedAgent.includes(agent)));
  const selected = specific.length ? specific : groups.filter(item => item.agents.includes("*"));
  const rules = selected.flatMap(item => item.rules);
  return { rules, sitemaps: [...new Set(sitemaps)] };
}

export function isAllowedByRobots(pathAndQuery, rules = []) {
  const path = String(pathAndQuery || "/");
  let winner = null;
  let winnerLength = -1;
  for (const rule of rules) {
    const pattern = String(rule.path || "");
    if (!pattern) continue;
    const specificity = pattern.replace(/[\*$]/g, "").length;
    if (specificity < winnerLength) continue;
    if (!wildcardPattern(pattern).test(path)) continue;
    if (specificity > winnerLength || (specificity === winnerLength && rule.type === "allow")) {
      winner = rule.type;
      winnerLength = specificity;
    }
  }
  return winner !== "disallow";
}
