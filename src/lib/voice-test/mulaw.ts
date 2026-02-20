/**
 * Mulaw decoding for browser audio playback.
 * Converts mulaw-encoded 8kHz audio to Float32 PCM.
 */

const MULAW_BIAS = 33;

/**
 * Decode a single mulaw byte to a 16-bit linear sample.
 */
function mulawToLinear(mulawByte: number): number {
  mulawByte = ~mulawByte & 0xff;
  const sign = mulawByte & 0x80 ? -1 : 1;
  const exponent = (mulawByte >> 4) & 0x07;
  const mantissa = mulawByte & 0x0f;
  let sample = ((mantissa << 3) + 0x84) << exponent;
  sample -= MULAW_BIAS;
  return sign * sample;
}

/**
 * Decode a Uint8Array of mulaw bytes to Float32 PCM samples.
 */
export function decodeMulaw(mulawData: Uint8Array): Float32Array {
  const pcm = new Float32Array(mulawData.length);
  for (let i = 0; i < mulawData.length; i++) {
    pcm[i] = mulawToLinear(mulawData[i]) / 32768;
  }
  return pcm;
}

/**
 * Create an AudioBuffer from mulaw data, upsampled from 8kHz to the target sample rate.
 */
export function mulawToAudioBuffer(
  mulawData: Uint8Array,
  audioContext: AudioContext
): AudioBuffer {
  const pcm8k = decodeMulaw(mulawData);
  const targetRate = audioContext.sampleRate;
  const ratio = targetRate / 8000;
  const outputLength = Math.ceil(pcm8k.length * ratio);
  const buffer = audioContext.createBuffer(1, outputLength, targetRate);
  const output = buffer.getChannelData(0);

  // Linear interpolation upsampling
  for (let i = 0; i < outputLength; i++) {
    const srcIndex = i / ratio;
    const srcFloor = Math.floor(srcIndex);
    const srcCeil = Math.min(srcFloor + 1, pcm8k.length - 1);
    const frac = srcIndex - srcFloor;
    output[i] = pcm8k[srcFloor] * (1 - frac) + pcm8k[srcCeil] * frac;
  }

  return buffer;
}
