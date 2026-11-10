import test from "node:test";
import assert from "node:assert/strict";
import {readTextLimited} from "../src/http-utils.js";

test("reads a response within the byte limit", async () => {
  const response = new Response("Umar SEO AI");
  assert.equal(await readTextLimited(response, 32), "Umar SEO AI");
});

test("counts UTF-8 bytes rather than JavaScript characters", async () => {
  const response = new Response("SEO 🚀");
  assert.equal(await readTextLimited(response, 8), "SEO 🚀");
  await assert.rejects(
    readTextLimited(new Response("SEO 🚀"), 7),
    /size limit/
  );
});

test("enforces the limit while streaming when Content-Length is absent", async () => {
  const response = new Response(new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode("1234"));
      controller.enqueue(new TextEncoder().encode("5678"));
      controller.close();
    }
  }));
  await assert.rejects(readTextLimited(response, 6), /size limit/);
});

test("rejects an oversized declared Content-Length before reading", async () => {
  const response = new Response("tiny", {
    headers: {"content-length": "100"}
  });
  await assert.rejects(readTextLimited(response, 10), /size limit/);
});

test("requires a positive integer byte limit", async () => {
  await assert.rejects(readTextLimited(new Response("x"), 0), /positive maximum/);
});
