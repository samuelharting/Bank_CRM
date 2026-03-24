import type { InvocationContext } from "@azure/functions";

export interface LlmOptions {
  system: string;
  user: string;
  maxTokens?: number;
  temperature?: number;
}

const LLM_TIMEOUT_MS = 30_000;

export const callLlm = async (opts: LlmOptions, context: InvocationContext): Promise<string> => {
  const zhipuKey = process.env.ZHIPU_API_KEY;
  const anthropicKey =
    process.env.ANTHROPIC_API_KEY && process.env.ANTHROPIC_API_KEY !== "your-anthropic-api-key"
      ? process.env.ANTHROPIC_API_KEY
      : undefined;

  if (!zhipuKey && !anthropicKey) {
    throw new Error("No AI API key configured (set ZHIPU_API_KEY or ANTHROPIC_API_KEY)");
  }

  const maxTokens = opts.maxTokens ?? 1500;
  const temperature = opts.temperature ?? 0.3;

  if (zhipuKey) {
    const model = process.env.ZHIPU_MODEL?.trim() || "glm-4-flash";
    const baseUrl =
      process.env.ZHIPU_API_BASE_URL?.trim() ||
      "https://open.bigmodel.cn/api/paas/v4/chat/completions";
    const res = await fetch(baseUrl, {
      method: "POST",
      signal: AbortSignal.timeout(LLM_TIMEOUT_MS),
      headers: { Authorization: `Bearer ${zhipuKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        temperature,
        max_tokens: maxTokens,
        messages: [
          { role: "system", content: opts.system },
          { role: "user", content: opts.user },
        ],
      }),
    });
    if (!res.ok) {
      const errText = await res.text();
      context.error("LLM error:", errText);
      throw new Error(`LLM API error (${res.status}): ${errText.slice(0, 300)}`);
    }
    const payload = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const text = payload.choices?.[0]?.message?.content;
    if (!text) throw new Error("LLM response did not include content");
    return text;
  }

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    signal: AbortSignal.timeout(LLM_TIMEOUT_MS),
    headers: {
      "x-api-key": anthropicKey!,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: "claude-3-5-sonnet-latest",
      max_tokens: maxTokens,
      temperature,
      system: opts.system,
      messages: [{ role: "user", content: opts.user }],
    }),
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Claude API error: ${errText}`);
  }
  const payload = (await res.json()) as { content?: Array<{ type: string; text?: string }> };
  const text = payload.content?.find((c) => c.type === "text")?.text;
  if (!text) throw new Error("Claude response did not include text content");
  return text;
};
