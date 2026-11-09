import test from "node:test";
import assert from "node:assert/strict";
import { runSeoAgentV2 } from "../src/seo-agent-v2.js";

test("prioritizes indexability and HTTP errors ahead of lower-risk findings", () => {
  const plan = runSeoAgentV2({
    website: "https://example.com",
    pagesScanned: 2,
    issues: [
      { severity: "low", page: "https://example.com/about", issue: "Multiple H1 headings (2)" },
      { severity: "high", page: "https://example.com/noindex", issue: "Page has noindex directive" },
      { severity: "high", page: "https://example.com/missing", issue: "HTTP status 404" }
    ]
  });

  assert.equal(plan.agent, "Umar SEO Agent V2");
  assert.equal(plan.actions[0].category, "indexability");
  assert.equal(plan.actions[0].priority, "critical");
  assert.equal(plan.actions[1].category, "crawlability");
  assert.equal(plan.summary.total, 3);
  assert.equal(plan.summary.awaitingApproval, 3);
});

test("does not mutate the supplied audit", () => {
  const audit = { website: "https://example.com", issues: [] };
  const before = structuredClone(audit);
  runSeoAgentV2(audit);
  assert.deepEqual(audit, before);
});

test("rejects data without an issues array", () => {
  assert.throws(() => runSeoAgentV2({ website: "https://example.com" }), {
    name: "TypeError"
  });
});
