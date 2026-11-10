const API = "https://generativelanguage.googleapis.com/v1beta/models/";
export async function generateAI({ prompt, env }) {
  if (!env.GEMINI_API_KEY) throw new Error("Gemini AI is not configured. Add GEMINI_API_KEY as a Worker secret.");
  if (typeof prompt !== "string" || !prompt.trim() || prompt.length > 30000) throw new Error("Prompt must contain 1–30000 characters.");
  const model = env.GEMINI_MODEL || "gemini-2.5-flash";
  if (!/^[a-zA-Z0-9._-]{3,100}$/.test(model)) throw new Error("Invalid Gemini model configuration.");
  const response = await fetch(API + encodeURIComponent(model) + ":generateContent", {
    method: "POST", headers: { "content-type": "application/json", "x-goog-api-key": env.GEMINI_API_KEY },
    body: JSON.stringify({ contents: [{ role: "user", parts: [{ text: prompt.trim() }] }], generationConfig: { temperature: 0.5, maxOutputTokens: 6000 } }),
    signal: AbortSignal.timeout(55000)
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error("Gemini API request failed (" + response.status + "): " + String(data?.error?.message || "Check key, model access and API limits.").slice(0,250));
  const text = (data.candidates?.[0]?.content?.parts || []).map(p => typeof p.text === "string" ? p.text : "").join("").trim();
  if (!text) throw new Error("Gemini returned no text; the response may have been blocked.");
  return { text, model: data.modelVersion || model, usage: data.usageMetadata || null };
}
