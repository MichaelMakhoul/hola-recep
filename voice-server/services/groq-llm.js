const DEFAULT_MODEL = "llama-3.3-70b-versatile";

/**
 * Calls Groq chat completion.
 *
 * @param {string} apiKey
 * @param {Array<{ role: string, content: string }>} messages
 * @param {{ model?: string }} [options]
 * @returns {Promise<string>}
 */
async function getChatResponse(apiKey, messages, options) {
  const model = options?.model || DEFAULT_MODEL;

  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages,
      max_tokens: 150,
      temperature: 0.7,
      stream: false,
    }),
  });

  if (!res.ok) {
    const text = (await res.text()).slice(0, 500);
    throw new Error(`Groq API error ${res.status}: ${text}`);
  }

  const data = await res.json();

  if (!data.choices || data.choices.length === 0) {
    throw new Error("Groq returned no choices");
  }

  const content = data.choices[0].message?.content;
  if (!content) {
    throw new Error(`Groq returned empty content (finish_reason: ${data.choices[0].finish_reason ?? "unknown"})`);
  }

  return content;
}

module.exports = { getChatResponse };
