const { WebSocket } = require("ws");

const MAX_MESSAGES = 21; // system prompt + 10 turn pairs

class CallSession {
  constructor(callSid) {
    this.callSid = callSid;
    this.streamSid = null;
    this.messages = [
      {
        role: "system",
        content:
          "You are a friendly, professional AI receptionist. " +
          "Keep responses concise (1-2 sentences). " +
          "You can help with general inquiries, take messages, and schedule callbacks. " +
          "If you don't know the answer, offer to take a message.",
      },
    ];
    this.isSpeaking = false;
    this.isProcessing = false;
    this.deepgramWs = null;
    this._sttDropWarned = false;
  }

  addMessage(role, content) {
    this.messages.push({ role, content });
    // Sliding window: keep system prompt + last N messages
    if (this.messages.length > MAX_MESSAGES) {
      this.messages = [this.messages[0], ...this.messages.slice(-MAX_MESSAGES + 1)];
    }
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
