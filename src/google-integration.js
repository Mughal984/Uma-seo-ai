import crypto from "node:crypto";

export function encryptGoogleToken(token, keyHex) {
  if (!/^[a-f0-9]{64}$/i.test(String(keyHex || ""))) {
    throw new Error("GOOGLE_TOKEN_ENCRYPTION_KEY must be 64 hexadecimal characters.");
  }
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", Buffer.from(keyHex, "hex"), iv);
  const encrypted = Buffer.concat([cipher.update(token, "utf8"), cipher.final()]);
  return [iv.toString("hex"), cipher.getAuthTag().toString("hex"), encrypted.toString("hex")].join(".");
}

export function decryptGoogleToken(payload, keyHex) {
  if (!/^[a-f0-9]{64}$/i.test(String(keyHex || ""))) {
    throw new Error("GOOGLE_TOKEN_ENCRYPTION_KEY must be 64 hexadecimal characters.");
  }
  const parts = String(payload || "").split(".");
  if (parts.length !== 3 || parts.some(part => !/^[a-f0-9]+$/i.test(part))) {
    throw new Error("Stored Google token is invalid.");
  }
  const [iv, tag, encrypted] = parts.map(part => Buffer.from(part, "hex"));
  if (iv.length !== 12 || tag.length !== 16) throw new Error("Stored Google token is invalid.");
  const decipher = crypto.createDecipheriv("aes-256-gcm", Buffer.from(keyHex, "hex"), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
}
