const DEFAULT_INTERVAL_MS = 60_000;
const MAX_EVENTS = 100;

/**
 * Runtime self-healing supervisor.
 * It performs bounded, reversible maintenance only; it never edits source code,
 * customer websites, or credentials.
 */
export function createSelfHealingSupervisor({ all, run, intervalMs = DEFAULT_INTERVAL_MS, now = () => new Date() }) {
  if (typeof all !== "function" || typeof run !== "function") {
    throw new TypeError("Database all/run functions are required.");
  }
  let timer = null;
  let running = false;
  const state = {
    status: "starting",
    startedAt: now().toISOString(),
    lastCheckAt: null,
    lastSuccessAt: null,
    lastError: null,
    checks: 0,
    recoveries: 0,
    failures: 0,
    actions: []
  };

  async function record(level, event, details = {}) {
    const safeDetails = JSON.stringify(details).slice(0, 1500);
    try {
      await run(
        "INSERT INTO system_events(level,event,details_json) VALUES(?,?,?)",
        [level, event, safeDetails]
      );
      await run(
        "DELETE FROM system_events WHERE id NOT IN (SELECT id FROM system_events ORDER BY id DESC LIMIT ?)",
        [MAX_EVENTS]
      );
    } catch {
      // Monitoring must never crash the application when event persistence fails.
    }
    state.actions.unshift({ at: now().toISOString(), level, event, details });
    state.actions = state.actions.slice(0, 20);
  }

  async function check() {
    if (running) return snapshot();
    running = true;
    state.checks += 1;
    state.lastCheckAt = now().toISOString();
    try {
      const integrity = await all("PRAGMA quick_check");
      if (!integrity.length || integrity.some(row => Object.values(row)[0] !== "ok")) {
        throw new Error("Database integrity check did not return ok.");
      }

      // Safe automatic recovery: expired one-time OAuth states cannot be reused.
      const expired = await run("DELETE FROM google_oauth_states WHERE expires_at < ?", [Date.now()]);
      if (expired.changes > 0) {
        state.recoveries += 1;
        await record("recovery", "expired_oauth_states_cleaned", { count: expired.changes });
      }

      state.status = "healthy";
      state.lastSuccessAt = state.lastCheckAt;
      state.lastError = null;
      return snapshot();
    } catch (error) {
      state.status = "degraded";
      state.failures += 1;
      state.lastError = String(error?.message || "Runtime health check failed.").slice(0, 240);
      await record("error", "runtime_health_check_failed", { message: state.lastError });
      return snapshot();
    } finally {
      running = false;
    }
  }

  function start() {
    if (timer) return;
    void check();
    timer = setInterval(() => { void check(); }, intervalMs);
    timer.unref?.();
  }

  function stop() {
    if (timer) clearInterval(timer);
    timer = null;
  }

  function snapshot() {
    return {
      ...state,
      actions: state.actions.map(item => ({ ...item }))
    };
  }

  return { check, start, stop, snapshot };
}
