/**
 * AudioWorklet processor that captures PCM audio, downsamples to 8kHz,
 * and encodes to mulaw for transmission to the voice server.
 */

const MULAW_BIAS = 33;
const MULAW_MAX = 0x1fff;
const TARGET_SAMPLE_RATE = 8000;
// Send a chunk every ~20ms (160 samples at 8kHz)
const CHUNK_SIZE = 160;

function linearToMulaw(sample) {
  // Clamp to 16-bit range
  sample = Math.max(-32768, Math.min(32767, Math.round(sample * 32768)));

  const sign = sample < 0 ? 0x80 : 0;
  if (sample < 0) sample = -sample;
  if (sample > MULAW_MAX) sample = MULAW_MAX;
  sample += MULAW_BIAS;

  let exponent = 7;
  for (let expMask = 0x4000; (sample & expMask) === 0 && exponent > 0; exponent--, expMask >>= 1) {}

  const mantissa = (sample >> (exponent + 3)) & 0x0f;
  return ~(sign | (exponent << 4) | mantissa) & 0xff;
}

class MulawEncoderProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this._resampleBuffer = [];
    this._resampleIndex = 0;
  }

  process(inputs) {
    const input = inputs[0];
    if (!input || !input[0]) return true;

    const pcmData = input[0]; // Float32Array, mono
    const ratio = sampleRate / TARGET_SAMPLE_RATE;

    // Simple downsampling: pick samples at intervals
    for (let i = 0; i < pcmData.length; i++) {
      this._resampleIndex += 1;
      if (this._resampleIndex >= ratio) {
        this._resampleIndex -= ratio;
        this._resampleBuffer.push(linearToMulaw(pcmData[i]));

        if (this._resampleBuffer.length >= CHUNK_SIZE) {
          this.port.postMessage(new Uint8Array(this._resampleBuffer));
          this._resampleBuffer = [];
        }
      }
    }

    return true;
  }
}

registerProcessor("mulaw-encoder-processor", MulawEncoderProcessor);
