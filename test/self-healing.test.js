import test from "node:test";
import assert from "node:assert/strict";
import { createSelfHealingSupervisor } from "../src/self-healing.js";

function fakeDb({ integrity = [{ quick_check: "ok" }], expired = 0, failIntegrity = false } = {}) {
  const calls = [];
  return {
    calls,
    all: async sql => {
      calls.push(sql);
      if (failIntegrity) throw new Error("database temporarily unavailable");
      return integrity;
    },
    run: async (sql, params) => {
      calls.push({ sql, params });
      return { changes: expired };
    }
  };
}

test("self-healing check verifies database and reaches healthy state", async () => {
  const db = fakeDb();
  const supervisor = createSelfHealingSupervisor({ ...db, now: () => new Date("2026-11-10T10:00:00Z") });
  const result = await supervisor.check();
  assert.equal(result.status, "healthy");
  assert.equal(result.checks, 1);
  assert.ok(result.lastSuccessAt);
  assert.ok(db.calls.some(call => typeof call === "string" && call.includes("quick_check")));
});

test("automatically cleans expired one-time OAuth states and records recovery", async () => {
  const db = fakeDb({ expired: 3 });
  const supervisor = createSelfHealingSupervisor(db);
  const result = await supervisor.check();
  assert.equal(result.status, "healthy");
  assert.equal(result.recoveries, 1);
  assert.equal(result.actions[0].event, "expired_oauth_states_cleaned");
});

test("marks runtime degraded on database failure without crashing", async () => {
  const db = fakeDb({ failIntegrity: true });
  const supervisor = createSelfHealingSupervisor(db);
  const result = await supervisor.check();
  assert.equal(result.status, "degraded");
  assert.equal(result.failures, 1);
  assert.match(result.lastError, /temporarily unavailable/);
});

test("marks runtime degraded when SQLite integrity check is not ok", async () => {
  const db = fakeDb({ integrity: [{ quick_check: "database disk image is malformed" }] });
  const supervisor = createSelfHealingSupervisor(db);
  const result = await supervisor.check();
  assert.equal(result.status, "degraded");
});
