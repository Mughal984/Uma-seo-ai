import test from "node:test";
import assert from "node:assert/strict";
import {checkPublicHost,normalizeUrl} from "../src/security.js";

test("normalizes public HTTP URLs and rejects unsafe schemes or credentials",()=>{
  assert.equal(normalizeUrl("https://example.com/path#section"),"https://example.com/path");
  assert.throws(()=>normalizeUrl("file:///etc/passwd"),/HTTP\/HTTPS/);
  assert.throws(()=>normalizeUrl("https://user:pass@example.com"),/HTTP\/HTTPS/);
});

test("blocks private, link-local, carrier-grade, reserved, and mapped IP ranges",async()=>{
  for(const url of ["http://127.0.0.1","http://10.0.0.5","http://100.64.0.1","http://169.254.1.1","http://192.168.1.1","http://198.18.0.1","http://203.0.113.5","http://[::1]","http://[fc00::1]","http://[fe80::1]","http://[::ffff:127.0.0.1]"]){
    await assert.rejects(checkPublicHost(url),/private|restricted/i,url);
  }
});

test("allows a public literal IP address",async()=>{
  await assert.doesNotReject(checkPublicHost("https://1.1.1.1"));
});

test("resolves and returns a single public address for connection pinning", async () => {
  const { resolvePublicAddress } = await import("../src/security.js");
  const record = await resolvePublicAddress("example.test", async (host, options) => {
    assert.equal(host, "example.test");
    assert.equal(options.all, true);
    return [{ address: "93.184.216.34", family: 4 }];
  });
  assert.deepEqual(record, { address: "93.184.216.34", family: 4 });
});

test("rejects DNS answers containing any private address", async () => {
  const { resolvePublicAddress } = await import("../src/security.js");
  await assert.rejects(resolvePublicAddress("rebind.test", async () => [
    { address: "93.184.216.34", family: 4 },
    { address: "127.0.0.1", family: 4 }
  ]), /private\/restricted/i);
});

test("pinned lookup always returns the validated address", async () => {
  const { createPinnedLookup } = await import("../src/security.js");
  const lookup = createPinnedLookup({ address: "93.184.216.34", family: 4 });
  const standard = await new Promise((resolve, reject) => lookup("attacker.test", {}, (error, address, family) => error ? reject(error) : resolve({ address, family })));
  assert.deepEqual(standard, { address: "93.184.216.34", family: 4 });
  const all = await new Promise((resolve, reject) => lookup("attacker.test", { all: true }, (error, records) => error ? reject(error) : resolve(records)));
  assert.deepEqual(all, [{ address: "93.184.216.34", family: 4 }]);
});
