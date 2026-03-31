import type { InvocationContext } from "@azure/functions";

export interface LlmOptions {
  system: string;
  user: string;
  maxTokens?: number;
  temperature?: number;
  webSearchQuery?: string;
  webSearchCount?: number;
}

export interface LlmWebSearchResult {
  title: string;
  content: string;
  link: string;
  refer?: string;
  publishDate?: string;
}

export interface LlmResponse {
  text: string;
  webSearch: LlmWebSearchResult[];
}

const LLM_TIMEOUT_MS = 60_000;

export const isLlmTimeoutError = (error: unknown): boolean =>
  error instanceof Error && /timed out|timeout/i.test(error.message);

export const isLlmEmptyResponseError = (error: unknown): boolean =>
  error instanceof Error && /did not include content|empty AI response/i.test(error.message);

export const isLlmRateLimitError = (error: unknown): boolean =>
  error instanceof Error && (/rate limit/i.test(error.message) || /\(429\)/.test(error.message) || /"1302"/.test(error.message));

export const getUserFacingLlmError = (error: unknown): string => {
  if (isLlmRateLimitError(error)) {
    return "The AI provider is rate-limiting requests right now. Try again in a moment.";
  }
  if (isLlmTimeoutError(error)) {
    return "The AI provider took too long to respond. Try again in a moment.";
  }
  if (isLlmEmptyResponseError(error)) {
    return "The AI provider returned an empty answer. Try again in a moment.";
  }
  return error instanceof Error ? error.message : "Unexpected AI provider error";
};

const extractZhipuText = (payload: unknown): string => {
  if (!payload || typeof payload !== "object") {
    throw new Error("Empty AI response");
  }

  const choice = (payload as { choices?: Array<{ message?: unknown }> }).choices?.[0];
  const message = choice?.message;
  if (!message || typeof message !== "object") {
    throw new Error("LLM response did not include content");
  }

  const content = (message as { content?: unknown }).content;
  if (typeof content === "string" && content.trim()) {
    return content.trim();
  }

  if (Array.isArray(content)) {
    const text = content
      .map((item) => {
        if (typeof item === "string") return item;
        if (item && typeof item === "object" && "text" in item && typeof item.text === "string") return item.text;
        return "";
      })
      .join("")
      .trim();
    if (text) return text;
  }

  throw new Error("LLM response did not include content");
};

const extractZhipuWebSearch = (payload: unknown): LlmWebSearchResult[] => {
  if (!payload || typeof payload !== "object") {
    return [];
  }

  const webSearch = (payload as {
    web_search?: Array<{
      title?: unknown;
      content?: unknown;
      link?: unknown;
      refer?: unknown;
      publish_date?: unknown;
    }>;
  }).web_search;

  return (webSearch ?? [])
    .map((result) => ({
      title: typeof result?.title === "string" ? result.title.trim() : "",
      content: typeof result?.content === "string" ? result.content.trim() : "",
      link: typeof result?.link === "string" ? result.link.trim() : "",
      refer: typeof result?.refer === "string" && result.refer.trim() ? result.refer.trim() : undefined,
      publishDate:
        typeof result?.publish_date === "string" && result.publish_date.trim() ? result.publish_date.trim() : undefined,
    }))
    .filter((result) => result.title && result.link);
};

export const callLlmDetailed = async (opts: LlmOptions, context: InvocationContext): Promise<LlmResponse> => {
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
    const model = process.env.ZHIPU_MODEL?.trim() || "glm-4.7-flash";
    const baseUrl =
      process.env.ZHIPU_API_BASE_URL?.trim() ||
      "https://api.z.ai/api/paas/v4/chat/completions";
    let res: Response;
    try {
      const body: Record<string, unknown> = {
        model,
        temperature,
        max_tokens: maxTokens,
        thinking: { type: "disabled" },
        messages: [
          { role: "system", content: opts.system },
          { role: "user", content: opts.user },
        ],
      };

      if (opts.webSearchQuery?.trim()) {
        body.tools = [
          {
            type: "web_search",
            web_search: {
              enable: true,
              search_engine: "search-prime",
              search_query: opts.webSearchQuery.trim(),
              search_result: true,
              count: Math.max(1, Math.min(opts.webSearchCount ?? 5, 10)),
              search_recency_filter: "noLimit",
            },
          },
        ];
      }

      res = await fetch(baseUrl, {
        method: "POST",
        signal: AbortSignal.timeout(LLM_TIMEOUT_MS),
        headers: { Authorization: `Bearer ${zhipuKey}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
    } catch (error) {
      if (isLlmTimeoutError(error)) {
        throw new Error("LLM request timed out");
      }
      throw error;
    }
    if (!res.ok) {
      const errText = await res.text();
      context.error("LLM error:", errText);
      throw new Error(`LLM API error (${res.status}): ${errText.slice(0, 300)}`);
    }
    const payload = (await res.json()) as unknown;
    return {
      text: extractZhipuText(payload),
      webSearch: extractZhipuWebSearch(payload),
    };
  }

  let res: Response;
  try {
    res = await fetch("https://api.anthropic.com/v1/messages", {
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
  } catch (error) {
    if (isLlmTimeoutError(error)) {
      throw new Error("LLM request timed out");
    }
    throw error;
  }
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Claude API error: ${errText}`);
  }
  const payload = (await res.json()) as { content?: Array<{ type: string; text?: string }> };
  const text = payload.content?.find((c) => c.type === "text")?.text;
  if (!text) throw new Error("Claude response did not include text content");
  return {
    text,
    webSearch: [],
  };
};

export const callLlm = async (opts: LlmOptions, context: InvocationContext): Promise<string> => {
  const response = await callLlmDetailed(opts, context);
  return response.text;
};
