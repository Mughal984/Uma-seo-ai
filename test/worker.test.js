import test from "node:test";
import assert from "node:assert/strict";
import worker from "../worker/index.js";

function envWithDb() {
  return {
    JWT_SECRET: "test-only-secret-that-is-long-enough-123456",
    DB: { prepare(sql) { return { first: async () => ({ ok: 1 }) }; } }
  };
}

test("health endpoint confirms the D1 binding is reachable", async () => {
  const response = await worker.fetch(new Request("https://example.test/api/health"), envWithDb());
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.status, "ok");
  assert.equal(body.database, "connected");
  assert.equal(body.runtime, "cloudflare-workers");
});

test("worker refuses to start without a D1 binding", async () => {
  const response = await worker.fetch(new Request("https://example.test/api/health"), { JWT_SECRET: "x".repeat(40) });
  assert.equal(response.status, 503);
});

test("worker refuses weak JWT secrets", async () => {
  const response = await worker.fetch(new Request("https://example.test/api/health"), { ...envWithDb(), JWT_SECRET: "weak" });
  assert.equal(response.status, 503);
});

test("protected endpoints reject unauthenticated requests", async () => {
  const response = await worker.fetch(new Request("https://example.test/api/projects"), envWithDb());
  assert.equal(response.status, 401);
});
