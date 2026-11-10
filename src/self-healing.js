const DEFAULT_INTERVAL_MS = 60_000;
const DEFAULT_DIAGNOSTIC_INTERVAL_MS = 5 * 60_000;
const DEFAULT_REPAIR_COOLDOWN_MS = 30 * 60_000;
const MAX_EVENTS = 100;

/**
 * Runtime supervisor. It checks database integrity, performs bounded cleanup,
 * and optionally runs the project test suite. A failed test suite may trigger
 * the guarded source-repair engine; successful repairs request a process restart.
 */
export function createSelfHealingSupervisor({
  all,
  run,
  intervalMs = DEFAULT_INTERVAL_MS,
  diagnosticIntervalMs = DEFAULT_DIAGNOSTIC_INTERVAL_MS,
  repairCooldownMs = DEFAULT_REPAIR_COOLDOWN_MS,
  diagnose = null,
  repair = null,
  restart = null,
  now = () => new Date()
}) {
  if (typeof all !== "function" || typeof run !== "function") {
    throw new TypeError("Database all/run functions are required.");
  }
  if (diagnose !== null && typeof diagnose !== "function") throw new TypeError("diagnose must be a function.");
  if (repair !== null && typeof repair !== "function") throw new TypeError("repair must be a function.");
  let timer = null;
  let running = false;
  let lastDiagnosticMs = 0;
  let lastRepairMs = 0;
  let restartRequested = false;
  const state = {
    status: "starting",
    startedAt: now().toISOString(),
    lastCheckAt: null,
    lastSuccessAt: null,
    lastDiagnosticAt: null,
    lastRepairAt: null,
    lastError: null,
    checks: 0,
    diagnostics: 0,
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

      const expired = await run("DELETE FROM google_oauth_states WHERE expires_at < ?", [Date.now()]);
      if (expired.changes > 0) {
        state.recoveries += 1;
        await record("recovery", "expired_oauth_states_cleaned", { count: expired.changes });
      }

      const currentMs = now().getTime();
      if (diagnose && repair && !restartRequested && currentMs - lastDiagnosticMs >= diagnosticIntervalMs) {
        lastDiagnosticMs = currentMs;
        state.lastDiagnosticAt = now().toISOString();
        state.diagnostics += 1;
        const validation = await diagnose();
        if (!validation?.passed) {
          const diagnosticText = String(validation?.output || validation?.reason || "Project test suite failed.").slice(0, 8000);
          await record("warning", "automated_diagnostics_failed", {
            reason: validation?.reason || "unknown",
            exitCode: validation?.exitCode ?? null
          });
          if (currentMs - lastRepairMs >= repairCooldownMs) {
            lastRepairMs = currentMs;
            state.lastRepairAt = now().toISOString();
            const result = await repair({ diagnostics: diagnosticText });
            if (result?.applied === true) {
              state.recoveries += 1;
              restartRequested = true;
              state.status = "restart_required";
              await record("recovery", "automatic_source_repair_applied", {
                files: result.files || [],
                backupDirectory: result.backupDirectory || null,
                validation: result.validation?.reason || "tests_passed"
              });
              if (typeof restart === "function") {
                await restart();
                await record("warning", "process_restart_requested", {});
              }
              return snapshot();
            }
            state.status = "degraded";
            state.failures += 1;
            state.lastError = "Automatic repair was not applied: " + String(result?.reason || "safe repair unavailable").slice(0, 180);
            await record("error", "automatic_source_repair_not_applied", {
              reason: result?.reason || "unknown",
              rolledBack: result?.rolledBack === true
            });
            return snapshot();
          }
          state.status = "degraded";
          state.lastError = "Diagnostics failed; automatic repair is cooling down.";
          return snapshot();
        }
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
