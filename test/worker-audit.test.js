import test from "node:test";
import assert from "node:assert/strict";
import { runSiteAudit } from "../worker/audit.js";

test("Workers audit rejects localhost before making a network request", async () => {
  await assert.rejects(() => runSiteAudit("http://localhost"), /Local\/private network destinations are blocked/);
});
test("Workers audit rejects loopback IPs", async () => {
  await assert.rejects(() => runSiteAudit("http://127.0.0.1"), /Local\/private network destinations are blocked/);
});
test("Workers audit rejects non-HTTP schemes", async () => {
  await assert.rejects(() => runSiteAudit("file:///etc/passwd"), /Only public HTTP\/HTTPS URLs are allowed/);
});
