/**
 * Input Type Detector
 *
 * Analyzes the last assistant message to determine what type of input
 * the AI is expecting next. Used to adapt STT buffering — structured
 * inputs like phone numbers need longer buffers than general conversation.
 *
 * Pure regex, no LLM call.
 */

const INPUT_PATTERNS = {
  phone: [
    /phone\s*number/i,
    /contact\s*number/i,
    /mobile\s*(number|phone)?/i,
    /cell\s*(number|phone)?/i,
    /call\s*you\s*at/i,
    /reach\s*you\s*at/i,
    /best\s*number/i,
    /callback\s*number/i,
    /number\s*(to|I|we)\s*(can|could|should)/i,
  ],
  email: [
    /e[\s-]?mail/i,
    /email\s*address/i,
  ],
  name: [
    /your\s*(full\s*)?name/i,
    /first\s*name/i,
    /last\s*name/i,
    /who\s*am\s*I\s*speaking/i,
    /may\s*I\s*(have|get)\s*your\s*name/i,
    /name\s*(please|for)/i,
    /spell\s*your\s*name/i,
  ],
  address: [
    /address/i,
    /street\s*(name|number|address)?/i,
    /suburb/i,
    /postcode/i,
    /zip\s*code/i,
    /city\s*and\s*state/i,
    /mailing\s*address/i,
    /where\s*(are\s*you|do\s*you)\s*located/i,
  ],
  date_time: [
    /what\s*(date|time|day)/i,
    /when\s*would/i,
    /which\s*day/i,
    /preferred\s*(date|time|day)/i,
    /what\s*time\s*(works|suits|is)/i,
    /when\s*(are|is)\s*(you|the)/i,
    /schedule\s*(for|on)/i,
  ],
};

/**
 * Detect what type of input the AI is expecting based on its last message.
 *
 * @param {string} lastAssistantMessage
 * @returns {"phone"|"email"|"name"|"address"|"date_time"|"general"}
 */
function detectExpectedInput(lastAssistantMessage) {
  if (!lastAssistantMessage) return "general";

  for (const [type, patterns] of Object.entries(INPUT_PATTERNS)) {
    for (const pattern of patterns) {
      if (pattern.test(lastAssistantMessage)) {
        return type;
      }
    }
  }

  return "general";
}

module.exports = { detectExpectedInput };
