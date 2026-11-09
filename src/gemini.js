const API_BASE = "https://generativelanguage.googleapis.com/v1beta/models/";

export async function generateGeminiText({
  prompt,
  apiKey = process.env.GEMINI_API_KEY,
  model = process.env.GEMINI_MODEL || "gemini-3.5-flash-lite",
  fetchImpl = fetch
}) {
  if (!apiKey) throw new Error("Gemini AI is not configured. Add GEMINI_API_KEY to the server environment.");
  if (typeof prompt !== "string" || !prompt.trim() || prompt.length > 30000) {
    throw new TypeError("A non-empty prompt of at most 30000 characters is required.");
  }
  if (!/^[a-zA-Z0-9._-]{3,100}$/.test(model)) throw new TypeError("Invalid Gemini model name.");

  const response = await fetchImpl(API_BASE + encodeURIComponent(model) + ":generateContent", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: prompt.trim() }] }],
      generationConfig: { temperature: 0.5, maxOutputTokens: 6000 }
    }),
    signal: AbortSignal.timeout(60000)
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const providerMessage = String(data?.error?.message || "").slice(0, 300);
    throw new Error("Gemini API request failed (" + response.status + "). " +
      (providerMessage || "Check the API key, model access, and Gemini API limits."));
  }
  const text = (data.candidates?.[0]?.content?.parts || [])
    .map(part => typeof part.text === "string" ? part.text : "")
    .join("")
    .trim();
  if (!text) throw new Error("Gemini returned no text. The response may have been blocked by safety settings.");
  return { text, model: data.modelVersion || model, usage: data.usageMetadata || null };
}
