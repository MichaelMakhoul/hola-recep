"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { mulawToAudioBuffer } from "./mulaw";

export interface TranscriptMessage {
  role: "assistant" | "user";
  content: string;
  timestamp?: Date;
}

export type VoiceTestStatus = "idle" | "connecting" | "active" | "ended" | "error";

interface UseVoiceTestOptions {
  assistantId: string;
}

export function useVoiceTest({ assistantId }: UseVoiceTestOptions) {
  const [status, setStatus] = useState<VoiceTestStatus>("idle");
  const [isMuted, setIsMuted] = useState(false);
  const [transcript, setTranscript] = useState<TranscriptMessage[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isAssistantSpeaking, setIsAssistantSpeaking] = useState(false);

  const wsRef = useRef<WebSocket | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const workletNodeRef = useRef<AudioWorkletNode | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const sourceNodeRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const audioQueueRef = useRef<AudioBuffer[]>([]);
  const isPlayingRef = useRef(false);
  const currentSourceRef = useRef<AudioBufferSourceNode | null>(null);

  /**
   * Play queued audio buffers sequentially.
   */
  const playNextInQueue = useCallback(() => {
    const ctx = audioContextRef.current;
    if (!ctx || audioQueueRef.current.length === 0) {
      isPlayingRef.current = false;
      return;
    }

    isPlayingRef.current = true;
    const buffer = audioQueueRef.current.shift()!;
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(ctx.destination);
    currentSourceRef.current = source;

    source.onended = () => {
      currentSourceRef.current = null;
      playNextInQueue();
    };

    source.start();
  }, []);

  /**
   * Enqueue an audio buffer for playback.
   */
  const enqueueAudio = useCallback(
    (buffer: AudioBuffer) => {
      audioQueueRef.current.push(buffer);
      if (!isPlayingRef.current) {
        playNextInQueue();
      }
    },
    [playNextInQueue]
  );

  /**
   * Start a test call.
   */
  const start = useCallback(async () => {
    setStatus("connecting");
    setError(null);
    setTranscript([]);
    setIsAssistantSpeaking(false);
    audioQueueRef.current = [];

    try {
      // 1. Get token from API
      const tokenRes = await fetch("/api/v1/test-call/token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assistantId }),
      });

      if (!tokenRes.ok) {
        const err = await tokenRes.json().catch(() => ({}));
        throw new Error(err.error || "Failed to get test call token");
      }

      const { token, wsUrl } = await tokenRes.json();

      // 2. Get microphone access
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      mediaStreamRef.current = stream;

      // 3. Set up AudioContext and worklet for mulaw encoding
      const ctx = new AudioContext({ sampleRate: 48000 });
      audioContextRef.current = ctx;

      await ctx.audioWorklet.addModule("/audio-worklets/mulaw-encoder-processor.js");
      const workletNode = new AudioWorkletNode(ctx, "mulaw-encoder-processor");
      workletNodeRef.current = workletNode;

      const sourceNode = ctx.createMediaStreamSource(stream);
      sourceNodeRef.current = sourceNode;
      sourceNode.connect(workletNode);
      // Worklet doesn't produce output — it sends data via port

      // 4. Connect WebSocket
      const ws = new WebSocket(`${wsUrl}?token=${encodeURIComponent(token)}`);
      wsRef.current = ws;

      // Forward mulaw audio from worklet to WebSocket
      workletNode.port.onmessage = (event: MessageEvent) => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(event.data as Uint8Array);
        }
      };

      ws.onopen = () => {
        // Wait for "ready" message before setting active
      };

      ws.onmessage = (event: MessageEvent) => {
        if (event.data instanceof Blob) {
          // Binary audio data — decode mulaw and play
          event.data.arrayBuffer().then((ab) => {
            const mulawData = new Uint8Array(ab);
            if (mulawData.length > 0 && audioContextRef.current) {
              const audioBuffer = mulawToAudioBuffer(mulawData, audioContextRef.current);
              enqueueAudio(audioBuffer);
            }
          });
          return;
        }

        // JSON message
        try {
          const msg = JSON.parse(event.data);

          switch (msg.type) {
            case "ready":
              setStatus("active");
              break;

            case "transcript":
              if (msg.isFinal && msg.content?.trim()) {
                setTranscript((prev) => {
                  const lastMsg = prev[prev.length - 1];
                  if (lastMsg && lastMsg.role === msg.role) {
                    return [
                      ...prev.slice(0, -1),
                      { role: msg.role, content: msg.content, timestamp: new Date() },
                    ];
                  }
                  return [...prev, { role: msg.role, content: msg.content, timestamp: new Date() }];
                });
              }
              break;

            case "speaking":
              setIsAssistantSpeaking(msg.speaking);
              break;

            case "ended":
              setStatus("ended");
              break;

            case "error":
              setError(msg.message || "An error occurred");
              setStatus("error");
              break;
          }
        } catch {
          // Ignore invalid JSON
        }
      };

      ws.onerror = () => {
        setError("Connection error");
        setStatus("error");
      };

      ws.onclose = (event) => {
        if (status !== "ended" && status !== "error") {
          setStatus("ended");
        }
        cleanup();
      };
    } catch (err) {
      console.error("Failed to start test call:", err);
      setError(err instanceof Error ? err.message : "Failed to start test call");
      setStatus("error");
      cleanup();
    }
  }, [assistantId, enqueueAudio]); // eslint-disable-line react-hooks/exhaustive-deps

  /**
   * Stop the test call.
   */
  const stop = useCallback(() => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: "stop" }));
    }
    setStatus("ended");
    cleanup();
  }, []);

  /**
   * Toggle microphone mute.
   */
  const toggleMute = useCallback(() => {
    const stream = mediaStreamRef.current;
    if (stream) {
      const track = stream.getAudioTracks()[0];
      if (track) {
        track.enabled = !track.enabled;
        setIsMuted(!track.enabled);
      }
    }
  }, []);

  /**
   * Reset to idle state for another test call.
   */
  const reset = useCallback(() => {
    cleanup();
    setStatus("idle");
    setIsMuted(false);
    setTranscript([]);
    setError(null);
    setIsAssistantSpeaking(false);
  }, []);

  function cleanup() {
    // Stop any playing audio
    if (currentSourceRef.current) {
      try {
        currentSourceRef.current.stop();
      } catch {
        // Already stopped
      }
      currentSourceRef.current = null;
    }
    audioQueueRef.current = [];
    isPlayingRef.current = false;

    // Disconnect worklet
    if (workletNodeRef.current) {
      workletNodeRef.current.disconnect();
      workletNodeRef.current = null;
    }

    // Disconnect source
    if (sourceNodeRef.current) {
      sourceNodeRef.current.disconnect();
      sourceNodeRef.current = null;
    }

    // Close audio context
    if (audioContextRef.current && audioContextRef.current.state !== "closed") {
      audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
    }

    // Stop media stream
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((t) => t.stop());
      mediaStreamRef.current = null;
    }

    // Close WebSocket
    if (wsRef.current) {
      if (wsRef.current.readyState === WebSocket.OPEN || wsRef.current.readyState === WebSocket.CONNECTING) {
        wsRef.current.close();
      }
      wsRef.current = null;
    }
  }

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cleanup();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return {
    status,
    isMuted,
    transcript,
    error,
    isAssistantSpeaking,
    start,
    stop,
    toggleMute,
    reset,
  };
}
