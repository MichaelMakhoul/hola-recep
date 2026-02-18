/**
 * Calls Groq chat completion with Llama 3.3 70B.
 * Non-streaming for PoC simplicity.
 *
 * @param {string} apiKey
 * @param {Array<{ role: string, content: string }>} messages
 * @returns {Promise<string>}
 */
async function getChatResponse(apiKey, messages) {
  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "llama-3.3-70b-versatile",
      messages,
      max_tokens: 150,
      temperature: 0.7,
      stream: false,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Groq API error ${res.status}: ${text}`);
  }

  const data = await res.json();
  return data.choices[0].message.content;
}

module.exports = { getChatResponse };
