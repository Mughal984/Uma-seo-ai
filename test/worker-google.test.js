import test from "node:test";
import assert from "node:assert/strict";
import { encryptToken, decryptToken, signState, verifyState } from "../worker/google.js";

const key = "0123456789abcdef".repeat(4);
test("Google refresh tokens are encrypted and decrypt only with the correct key", async () => {
  const sealed = await encryptToken("refresh-token-example", key);
  assert.notEqual(sealed, "refresh-token-example");
  assert.equal(await decryptToken(sealed, key), "refresh-token-example");
  await assert.rejects(() => decryptToken(sealed, "fedcba9876543210".repeat(4)));
});
test("Google OAuth state is signed and rejects tampering and expiry", async () => {
  const secret = "a-strong-test-secret-that-is-at-least-32-chars";
  const valid = { uid: 42, nonce: "nonce-value", iss: "umar-seo-ai-google", exp: Math.floor(Date.now()/1000)+300 };
  const signed = await signState(valid, secret);
  assert.deepEqual(await verifyState(signed, secret), valid);
  assert.equal(await verifyState(signed + "x", secret), null);
  assert.equal(await verifyState("not.a.valid.state", secret), null);
  assert.equal(await verifyState(await signState({...valid, exp: 1}, secret), secret), null);
});
