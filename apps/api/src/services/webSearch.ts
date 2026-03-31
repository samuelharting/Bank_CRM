import type { InvocationContext } from "@azure/functions";

export interface WebSearchResult {
  title: string;
  content: string;
  link: string;
  refer?: string;
  publishDate?: string;
}

interface ZhipuWebSearchResponse {
  search_result?: Array<{
    title?: string;
    content?: string;
    link?: string;
    refer?: string;
    publish_date?: string;
  }>;
}

const WEB_SEARCH_URL = "https://api.z.ai/api/paas/v4/web_search";

export const isWebSearchEnabled = (): boolean =>
  process.env.AI_WEB_SEARCH_ENABLED?.trim().toLowerCase() !== "false";

export const searchPublicWeb = async (
  query: string,
  context: InvocationContext,
  count = 5,
): Promise<WebSearchResult[]> => {
  if (!isWebSearchEnabled()) return [];

  const apiKey = process.env.ZHIPU_API_KEY?.trim();
  if (!apiKey || !query.trim()) return [];

  try {
    const response = await fetch(WEB_SEARCH_URL, {
      method: "POST",
      signal: AbortSignal.timeout(20_000),
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        search_engine: "search-prime",
        search_query: query,
        count: Math.max(1, Math.min(count, 10)),
        search_recency_filter: "noLimit",
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      context.warn(`Web search failed (${response.status}): ${errText.slice(0, 300)}`);
      return [];
    }

    const payload = (await response.json()) as ZhipuWebSearchResponse;
    return (payload.search_result ?? [])
      .map((result) => ({
        title: result.title?.trim() ?? "",
        content: result.content?.trim() ?? "",
        link: result.link?.trim() ?? "",
        refer: result.refer?.trim() || undefined,
        publishDate: result.publish_date?.trim() || undefined,
      }))
      .filter((result) => result.title && result.link);
  } catch (error) {
    context.warn("Web search request failed", error);
    return [];
  }
};
