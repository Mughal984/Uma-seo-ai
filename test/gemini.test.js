import test from "node:test";
import assert from "node:assert/strict";
import { generateGeminiText } from "../src/gemini.js";

test("Gemini adapter sends the key in the API-key header and returns generated text", async () => {
  let request;
  const result = await generateGeminiText({
    apiKey: "test-secret",
    model: "gemini-3.5-flash-lite",
    prompt: "Write a useful SEO title",
    fetchImpl: async (url, options) => {
      request = { url, options };
      return { ok: true, json: async () => ({
        modelVersion: "gemini-3.5-flash-lite",
        candidates: [{ content: { parts: [{ text: "A useful SEO title" }] } }]
      }) };
    }
  });
  assert.equal(request.options.headers["x-goog-api-key"], "test-secret");
  assert.match(request.url, /gemini-3\.5-flash-lite:generateContent$/);
  assert.equal(result.text, "A useful SEO title");
});

test("Gemini adapter rejects a missing API key before making a request", async () => {
  await assert.rejects(
    generateGeminiText({ prompt: "Hello", apiKey: "" }),
    /GEMINI_API_KEY/
  );
});

test("Gemini adapter reports provider errors without exposing the API key", async () => {
  await assert.rejects(
    generateGeminiText({
      prompt: "Hello",
      apiKey: "never-print-this",
      fetchImpl: async () => ({
        ok: false,
        status: 429,
        json: async () => ({ error: { message: "Rate limit reached" } })
      })
    }),
    error => error.message.includes("429") && !error.message.includes("never-print-this")
  );
});
