"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Vapi from "@vapi-ai/web";

export interface TranscriptMessage {
  role: "assistant" | "user";
  content: string;
  timestamp?: Date;
}

export interface VapiCallConfig {
  // For inline assistant configuration
  model?: {
    provider: string;
    model: string;
    messages: Array<{ role: string; content: string }>;
  };
  voice?: {
    provider: string;
    voiceId: string;
  };
  // For assistant ID
  assistantId?: string;
  // Override options - using any to avoid SDK type compatibility issues
  overrides?: Record<string, any>;
  // Audio device constraints
  audioDevices?: {
    inputDeviceId?: string;
    outputDeviceId?: string;
  };
}

export type VapiCallStatus = "idle" | "connecting" | "active" | "ended" | "error";

export function useVapi() {
  const [status, setStatus] = useState<VapiCallStatus>("idle");
  const [isMuted, setIsMutedState] = useState(false);
  const [transcript, setTranscript] = useState<TranscriptMessage[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [volumeLevel, setVolumeLevel] = useState(0);
  const [isAssistantSpeaking, setIsAssistantSpeaking] = useState(false);

  const vapiRef = useRef<Vapi | null>(null);
  const publicKeyRef = useRef<string | null>(null);
  const outputDeviceIdRef = useRef<string | null>(null);

  // Initialize Vapi with public key
  const initialize = useCallback((publicKey: string) => {
    if (typeof window === "undefined") return;

    publicKeyRef.current = publicKey;

    if (!vapiRef.current) {
      vapiRef.current = new Vapi(publicKey);

      // Set up event listeners
      vapiRef.current.on("call-start", () => {
        setStatus("active");
        setError(null);
      });

      vapiRef.current.on("call-end", () => {
        setStatus("ended");
        setIsAssistantSpeaking(false);
      });

      vapiRef.current.on("speech-start", () => {
        setIsAssistantSpeaking(true);
      });

      vapiRef.current.on("speech-end", () => {
        setIsAssistantSpeaking(false);
      });

      vapiRef.current.on("volume-level", (level: number) => {
        setVolumeLevel(level);
      });

      vapiRef.current.on("message", (message: any) => {
        if (message.type === "transcript") {
          const role = message.role as "assistant" | "user";
          const content = message.transcript;

          if (content && content.trim()) {
            setTranscript((prev) => {
              // Update the last message if it's from the same role (streaming)
              // or add a new message
              const lastMessage = prev[prev.length - 1];
              if (lastMessage && lastMessage.role === role) {
                // Replace with full transcript for streaming updates
                return [
                  ...prev.slice(0, -1),
                  { role, content, timestamp: new Date() },
                ];
              }
              return [...prev, { role, content, timestamp: new Date() }];
            });
          }
        }
      });

      vapiRef.current.on("error", (err: any) => {
        console.error("Vapi error:", err);
        setError(err?.message || "An error occurred during the call");
        setStatus("error");
      });
    }
  }, []);

  // Start a call with inline assistant config
  const startWithConfig = useCallback(async (config: VapiCallConfig) => {
    if (!vapiRef.current) {
      setError("Vapi not initialized. Call initialize() first.");
      return;
    }

    setStatus("connecting");
    setError(null);
    setTranscript([]);

    try {
      // Build device configuration if specified
      const deviceConfig = config.audioDevices?.inputDeviceId
        ? { inputDeviceId: config.audioDevices.inputDeviceId }
        : undefined;

      if (config.assistantId) {
        // Start with assistant ID and optional overrides
        await vapiRef.current.start(config.assistantId, {
          ...config.overrides,
          ...(deviceConfig && { deviceConfig }),
        } as any);
      } else if (config.model && config.voice) {
        // Start with inline configuration
        await vapiRef.current.start({
          model: config.model,
          voice: config.voice,
          ...(config.overrides?.firstMessage && {
            firstMessage: config.overrides.firstMessage,
          }),
        }, deviceConfig as any);
      } else {
        throw new Error("Either assistantId or model+voice configuration is required");
      }

      // Store output device ID for later use (speaker selection)
      if (config.audioDevices?.outputDeviceId) {
        outputDeviceIdRef.current = config.audioDevices.outputDeviceId;
      }
    } catch (err: any) {
      console.error("Failed to start Vapi call:", err);
      setError(err?.message || "Failed to start the call. Please check your microphone permissions.");
      setStatus("error");
    }
  }, []);

  // Stop the current call
  const stop = useCallback(() => {
    if (vapiRef.current) {
      vapiRef.current.stop();
    }
  }, []);

  // Toggle mute
  const toggleMute = useCallback(() => {
    if (vapiRef.current) {
      const newMuted = !isMuted;
      vapiRef.current.setMuted(newMuted);
      setIsMutedState(newMuted);
    }
  }, [isMuted]);

  // Set mute state
  const setMuted = useCallback((muted: boolean) => {
    if (vapiRef.current) {
      vapiRef.current.setMuted(muted);
      setIsMutedState(muted);
    }
  }, []);

  // Send a message to the assistant
  const sendMessage = useCallback((content: string, role: "system" | "user" = "user") => {
    if (vapiRef.current) {
      vapiRef.current.send({
        type: "add-message",
        message: { role, content },
      });
    }
  }, []);

  // Have the assistant say something
  const say = useCallback((message: string, endCallAfterSpoken: boolean = false) => {
    if (vapiRef.current) {
      vapiRef.current.say(message, endCallAfterSpoken);
    }
  }, []);

  // Reset state
  const reset = useCallback(() => {
    setStatus("idle");
    setIsMutedState(false);
    setTranscript([]);
    setError(null);
    setVolumeLevel(0);
    setIsAssistantSpeaking(false);
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (vapiRef.current) {
        vapiRef.current.stop();
      }
    };
  }, []);

  return {
    // State
    status,
    isMuted,
    transcript,
    error,
    volumeLevel,
    isAssistantSpeaking,
    // Methods
    initialize,
    startWithConfig,
    stop,
    toggleMute,
    setMuted,
    sendMessage,
    say,
    reset,
  };
}
