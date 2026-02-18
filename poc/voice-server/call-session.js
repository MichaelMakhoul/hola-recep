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
  }

  addMessage(role, content) {
    this.messages.push({ role, content });
  }

  destroy() {
    if (this.deepgramWs && this.deepgramWs.readyState === 1) {
      this.deepgramWs.close();
    }
    this.deepgramWs = null;
    this.messages = [];
  }
}

module.exports = { CallSession };
