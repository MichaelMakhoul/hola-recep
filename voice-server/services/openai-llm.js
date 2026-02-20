const DEFAULT_MODEL = "gpt-4.1-nano";
const MAX_RETRIES = 2;

/**
 * Calls OpenAI chat completion with optional tool/function calling support.
 * Retries on 429 rate-limit errors.
 *
 * @param {string} apiKey
 * @param {Array<{ role: string, content: string } | { role: string, tool_call_id: string, content: string }>} messages
 * @param {{ model?: string, tools?: object[], tool_choice?: string }} [options]
 * @returns {Promise<{ type: "content", content: string } | { type: "tool_calls", toolCalls: object[] }>}
 */
async function getChatResponse(apiKey, messages, options) {
  if (!messages || messages.length === 0) {
    throw new Error("getChatResponse called with empty messages array");
  }

  const model = options?.model || DEFAULT_MODEL;

  const body = {
    model,
    messages,
    max_tokens: 150,
    temperature: 0.7,
    stream: false,
  };

  // Add tools if provided (OpenAI function calling)
  if (options?.tools && options.tools.length > 0) {
    body.tools = options.tools;
    body.tool_choice = options.tool_choice || "auto";
    // Allow more tokens for tool call arguments
    body.max_tokens = 300;
  }

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      signal: AbortSignal.timeout(10_000),
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (res.status === 429 && attempt < MAX_RETRIES) {
      const retryAfter = res.headers.get("retry-after");
      const waitSec = retryAfter ? Math.min(parseFloat(retryAfter), 10) : 3;
      console.warn(`[LLM] Rate limited, retrying in ${waitSec}s (attempt ${attempt + 1}/${MAX_RETRIES})`);
      await new Promise((r) => setTimeout(r, waitSec * 1000));
      continue;
    }

    if (!res.ok) {
      const text = (await res.text()).slice(0, 500);
      throw new Error(`OpenAI API error ${res.status}: ${text}`);
    }

    const data = await res.json();

    if (!data.choices || data.choices.length === 0) {
      throw new Error("OpenAI returned no choices");
    }

    const message = data.choices[0].message;

    // Check for tool calls
    if (message.tool_calls && message.tool_calls.length > 0) {
      return { type: "tool_calls", toolCalls: message.tool_calls, message };
    }

    const content = message?.content;
    if (!content) {
      throw new Error(`OpenAI returned empty content (finish_reason: ${data.choices[0].finish_reason ?? "unknown"})`);
    }

    return { type: "content", content };
  }

  throw new Error("OpenAI API rate limited after all retries");
}

module.exports = { getChatResponse };
