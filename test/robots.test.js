import test from "node:test";
import assert from "node:assert/strict";
import { parseRobotsTxt, isAllowedByRobots } from "../src/robots.js";

test("parses sitemap directives and user-agent groups", () => {
  const parsed = parseRobotsTxt(`User-agent: *
Disallow: /private/
User-agent: UmarSEOAI
Allow: /private/public/
Disallow: /private/
Sitemap: https://example.com/sitemap.xml`);
  assert.equal(parsed.sitemaps[0], "https://example.com/sitemap.xml");
  assert.equal(isAllowedByRobots("/private/secret", parsed.rules), false);
  assert.equal(isAllowedByRobots("/private/public/page", parsed.rules), true);
});

test("uses longest matching rule and allow wins ties", () => {
  const rules = [
    { type: "disallow", path: "/folder/" },
    { type: "allow", path: "/folder/public/" },
    { type: "disallow", path: "/folder/public/" }
  ];
  assert.equal(isAllowedByRobots("/folder/private/page", rules), false);
  assert.equal(isAllowedByRobots("/folder/public/page", rules), true);
});

test("supports wildcard and end-anchor rules", () => {
  const rules = [
    { type: "disallow", path: "/*?session=" },
    { type: "disallow", path: "/exact$" }
  ];
  assert.equal(isAllowedByRobots("/page?session=abc", rules), false);
  assert.equal(isAllowedByRobots("/exact", rules), false);
  assert.equal(isAllowedByRobots("/exact/child", rules), true);
});

test("empty disallow does not block crawling", () => {
  const parsed = parseRobotsTxt("User-agent: *\nDisallow:");
  assert.equal(isAllowedByRobots("/", parsed.rules), true);
});
