const { WebSocket } = require("ws");

const MAX_MESSAGES = 21; // system prompt + up to 20 messages (user/assistant turns + tool call/result messages)

class CallSession {
  constructor(callSid) {
    this.callSid = callSid;
    this.streamSid = null;
    this.messages = [];
    this.isSpeaking = false;
    this.isProcessing = false;
    this.deepgramWs = null;
    this._sttDropWarned = false;

    // Production fields
    this.startedAt = Date.now();
    this.callerPhone = null;
    this.callRecordId = null;
    this.organizationId = null;
    this.assistantId = null;
    this.phoneNumberId = null;
    this.calendarEnabled = false;
    this.transferRules = [];
    this.deepgramVoice = null;
    this.callFailed = false;
    this.endedReason = null;
  }

  /**
   * Set the system prompt as the first message.
   */
  setSystemPrompt(prompt) {
    if (this.messages.length > 0 && this.messages[0].role === "system") {
      this.messages[0].content = prompt;
    } else {
      this.messages.unshift({ role: "system", content: prompt });
    }
  }

  addMessage(role, content) {
    this.messages.push({ role, content });
    // Sliding window: keep system prompt + last N messages
    if (this.messages.length > MAX_MESSAGES) {
      this.messages = [this.messages[0], ...this.messages.slice(-MAX_MESSAGES + 1)];
    }
  }

  /**
   * Build a transcript string from the conversation messages.
   * Excludes tool call internals — only user and assistant content messages.
   */
  getTranscript() {
    return this.messages
      .filter((m) => (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
      .map((m) => `${m.role === "user" ? "User" : "AI"}: ${m.content}`)
      .join("\n");
  }

  /**
   * Get call duration in seconds from startedAt to now.
   */
  getDurationSeconds() {
    return Math.round((Date.now() - this.startedAt) / 1000);
  }

  destroy() {
    if (this.deepgramWs && this.deepgramWs.readyState === WebSocket.OPEN) {
      this.deepgramWs.close();
    }
    this.deepgramWs = null;
    this.messages = [];
  }
}

module.exports = { CallSession };
