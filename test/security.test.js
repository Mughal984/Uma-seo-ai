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
