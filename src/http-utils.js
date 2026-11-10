/**
 * Read a Fetch Response as UTF-8 while enforcing a byte limit before buffering
 * the entire body. Content-Length is only an early hint; streamed bytes are
 * always counted because the header may be absent or incorrect.
 */
export async function readTextLimited(response, maxBytes) {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1) {
    throw new TypeError("A positive maximum response size is required.");
  }

  const declaredLength = Number(response.headers?.get?.("content-length") || 0);
  if (declaredLength > maxBytes) {
    if (response.body) await response.body.cancel().catch(() => {});
    throw new Error("Response exceeds the allowed size limit.");
  }

  if (!response.body) return "";
  const reader = response.body.getReader();
  const decoder = new TextDecoder("utf-8", { fatal: false });
  let totalBytes = 0;
  let text = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > maxBytes) {
        await reader.cancel("Response size limit exceeded").catch(() => {});
        throw new Error("Response exceeds the allowed size limit.");
      }
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
    return text;
  } finally {
    reader.releaseLock();
  }
}
