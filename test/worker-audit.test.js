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

test("Workers audit rejects carrier-grade NAT and reserved IPv4 literals", async () => {
  await assert.rejects(() => runSiteAudit("http://100.64.0.1"), /Local, reserved/);
  await assert.rejects(() => runSiteAudit("http://198.18.0.1"), /Local, reserved/);
  await assert.rejects(() => runSiteAudit("http://203.0.113.10"), /Local, reserved/);
});
test("Workers audit blocks IPv6 literal targets conservatively", async () => {
  await assert.rejects(() => runSiteAudit("http://[2001:4860:4860::8888]"), /Local, reserved/);
});
