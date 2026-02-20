/**
 * Voice preview utilities
 * Handles voice sample playback using ElevenLabs Text-to-Speech API
 */

import { setAudioOutputDevice } from "./device-selection";
import { VOICE_CATALOG, getVoiceById as _getVoiceById } from "@/lib/voices";
import type { CatalogVoice } from "@/lib/voices";

// Re-export from the canonical voice catalog for backward compatibility.
// Consumers that imported VOICE_OPTIONS / VoiceInfo / getVoiceById from this
// file (e.g. TestCall pages) will continue to work without changes.
export type VoiceInfo = CatalogVoice;
export const VOICE_OPTIONS = VOICE_CATALOG;
export const getVoiceById = _getVoiceById;

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
