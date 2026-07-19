// Thin, provider-agnostic chat client (OpenAI-compatible /chat/completions).
// Config is injected by the caller; this module never reads environment
// variables, so it runs identically under Deno (edge) and Node (eval harness),
// and swapping providers later means changing only the caller's config.

export const DEFAULT_AI_BASE_URL = "https://ai.gateway.lovable.dev/v1";
export const DEFAULT_AI_MODEL = "google/gemini-2.5-flash";

export interface AiConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
}

export interface AiClient {
  chatJson(opts: { system: string; user: string }): Promise<unknown>;
}

export function parseJsonResponse(raw: string): unknown {
  let text = raw.trim();
  const fence = text.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/);
  if (fence) text = fence[1];
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`AI returned unparseable JSON: ${text.slice(0, 200)}`);
  }
}

export function createAiClient(config: AiConfig): AiClient {
  return {
    async chatJson({ system, user }) {
      const res = await fetch(`${config.baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${config.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: config.model,
          messages: [
            { role: "system", content: system },
            { role: "user", content: user },
          ],
          response_format: { type: "json_object" },
        }),
      });
      if (!res.ok) {
        throw new Error(`AI request failed: ${res.status} ${await res.text()}`);
      }
      const data = await res.json();
      return parseJsonResponse(data.choices[0].message.content);
    },
  };
}
