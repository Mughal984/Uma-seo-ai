import test from "node:test";
import assert from "node:assert/strict";
import {encryptGoogleToken,decryptGoogleToken} from "../src/google-integration.js";

const key = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

test("encrypts and decrypts Google refresh tokens", () => {
  const encrypted = encryptGoogleToken("refresh-token-example", key);
  assert.notEqual(encrypted, "refresh-token-example");
  assert.equal(decryptGoogleToken(encrypted, key), "refresh-token-example");
});

test("rejects invalid encryption keys", () => {
  assert.throws(() => encryptGoogleToken("secret", "bad-key"));
});

test("rejects tampered encrypted token data", () => {
  const encrypted = encryptGoogleToken("secret", key);
  const parts = encrypted.split(".");
  parts[2] = "00" + parts[2].slice(2);
  assert.throws(() => decryptGoogleToken(parts.join("."), key));
});
