/**
 * Voice preview utilities
 * Handles voice sample playback using ElevenLabs Text-to-Speech API
 */

import { setAudioOutputDevice } from "./device-selection";

export interface VoiceInfo {
  id: string;
  name: string;
  description: string;
  previewText?: string;
}

// Default voice options with ElevenLabs voice IDs
export const VOICE_OPTIONS: VoiceInfo[] = [
  {
    id: "EXAVITQu4vr4xnSDxMaL",
    name: "Sarah",
    description: "Warm, professional female",
    previewText: "Hello! Thank you for calling. How may I assist you today?",
  },
  {
    id: "21m00Tcm4TlvDq8ikWAM",
    name: "Rachel",
    description: "Professional, authoritative female",
    previewText: "Good morning! I'd be happy to help you with your inquiry.",
  },
  {
    id: "pNInz6obpgDQGcFmaJgB",
    name: "Adam",
    description: "Friendly, trustworthy male",
    previewText: "Hi there! Thanks for reaching out. What can I do for you?",
  },
  {
    id: "jBpfuIE2acCO8z3wKNLl",
    name: "Emily",
    description: "Upbeat, enthusiastic female",
    previewText: "Hey! Great to hear from you! How can I help?",
  },
  {
    id: "yoZ06aMxZJJ28mfd3POQ",
    name: "Sam",
    description: "Calm, professional male",
    previewText: "Thank you for your call. I'm here to help you today.",
  },
];

/**
 * Get voice info by ID
 */
export function getVoiceById(voiceId: string): VoiceInfo | undefined {
  return VOICE_OPTIONS.find((v) => v.id === voiceId);
}

// Audio element for playback (reused to avoid creating multiple)
let audioElement: HTMLAudioElement | null = null;
let currentAbortController: AbortController | null = null;

/**
 * Stop any currently playing voice preview
 */
export function stopVoicePreview(): void {
  if (currentAbortController) {
    currentAbortController.abort();
    currentAbortController = null;
  }
  if (audioElement) {
    audioElement.pause();
    audioElement.currentTime = 0;
  }
}

/**
 * Preview a voice using ElevenLabs Text-to-Speech API
 * This calls our API route to avoid exposing the API key
 */
export async function playVoicePreview(
  voiceId: string,
  options?: {
    text?: string;
    outputDeviceId?: string;
    onStart?: () => void;
    onEnd?: () => void;
    onError?: (error: string) => void;
  }
): Promise<void> {
  // Stop any currently playing preview
  stopVoicePreview();

  const voice = getVoiceById(voiceId);
  const text = options?.text || voice?.previewText || "Hello! How may I assist you today?";

  // Create abort controller for this request
  currentAbortController = new AbortController();

  try {
    options?.onStart?.();

    // Call our API route to generate the audio
    const response = await fetch("/api/v1/voice-preview", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        voiceId,
        text,
      }),
      signal: currentAbortController.signal,
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: "Failed to generate voice preview" }));
      throw new Error(error.error || "Failed to generate voice preview");
    }

    // Get the audio blob
    const audioBlob = await response.blob();
    const audioUrl = URL.createObjectURL(audioBlob);

    // Create or reuse audio element
    if (!audioElement) {
      audioElement = new Audio();
    }

    audioElement.src = audioUrl;

    // Set output device if specified and supported
    if (options?.outputDeviceId) {
      await setAudioOutputDevice(audioElement, options.outputDeviceId);
    }

    // Set up event handlers
    audioElement.onended = () => {
      URL.revokeObjectURL(audioUrl);
      options?.onEnd?.();
    };

    audioElement.onerror = () => {
      URL.revokeObjectURL(audioUrl);
      options?.onError?.("Failed to play audio");
    };

    // Play the audio
    await audioElement.play();
  } catch (error: unknown) {
    if (error instanceof Error && error.name === "AbortError") {
      // Request was aborted, this is expected
      return;
    }
    const message = error instanceof Error ? error.message : "Failed to preview voice";
    options?.onError?.(message);
  }
}

/**
 * Check if voice preview is currently playing
 */
export function isVoicePreviewPlaying(): boolean {
  return audioElement !== null && !audioElement.paused;
}
