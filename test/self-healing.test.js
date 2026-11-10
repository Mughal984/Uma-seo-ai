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


test("automatic diagnostics repair a failed test suite and request restart", async () => {
  const db = fakeDb();
  let repaired = 0, restarted = 0;
  const supervisor = createSelfHealingSupervisor({
    ...db,
    diagnose: async () => ({ passed: false, reason: "tests_failed", output: "AssertionError: regression" }),
    repair: async ({ diagnostics }) => {
      assert.match(diagnostics, /AssertionError/);
      repaired += 1;
      return { applied: true, files: ["src/example.js"], backupDirectory: "data/backups", validation: { reason: "tests_passed" } };
    },
    restart: async () => { restarted += 1; }
  });
  const result = await supervisor.check();
  assert.equal(result.status, "restart_required");
  assert.equal(result.recoveries, 1);
  assert.equal(repaired, 1);
  assert.equal(restarted, 1);
  assert.equal(result.actions[0].event, "process_restart_requested");
});

test("automatic diagnostics never overwrite code when repair rolls back", async () => {
  const db = fakeDb();
  const supervisor = createSelfHealingSupervisor({
    ...db,
    diagnose: async () => ({ passed: false, reason: "tests_failed", output: "failing test" }),
    repair: async () => ({ applied: false, rolledBack: true, reason: "tests_failed" })
  });
  const result = await supervisor.check();
  assert.equal(result.status, "degraded");
  assert.match(result.lastError, /not applied/);
  assert.equal(result.recoveries, 0);
});

test("automatic diagnostics leave healthy code unchanged", async () => {
  const db = fakeDb();
  let repairCalls = 0;
  const supervisor = createSelfHealingSupervisor({
    ...db,
    diagnose: async () => ({ passed: true, reason: "tests_passed" }),
    repair: async () => { repairCalls += 1; return { applied: true }; }
  });
  const result = await supervisor.check();
  assert.equal(result.status, "healthy");
  assert.equal(result.diagnostics, 1);
  assert.equal(repairCalls, 0);
});
