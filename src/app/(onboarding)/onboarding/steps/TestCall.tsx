"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Phone,
  PhoneOff,
  Mic,
  MicOff,
  Loader2,
  CheckCircle2,
  Volume2,
  AlertCircle,
  Info,
  Settings,
  ChevronDown,
  Play,
  Square,
  MessageSquare,
} from "lucide-react";
import { useVapi, type VapiCallStatus } from "@/lib/vapi/use-vapi";
import {
  getAudioDevices,
  requestMicrophonePermission,
  getSelectedMicrophone,
  getSelectedSpeaker,
  saveSelectedMicrophone,
  saveSelectedSpeaker,
  supportsOutputDeviceSelection,
  type AudioDevice,
} from "@/lib/audio/device-selection";
import {
  playVoicePreview,
  stopVoicePreview,
  isVoicePreviewPlaying,
  getVoiceById,
  VOICE_OPTIONS,
} from "@/lib/audio/voice-preview";

interface TestCallProps {
  assistantData: {
    assistantName: string;
    systemPrompt: string;
    firstMessage: string;
    voiceId: string;
  };
  onTestComplete: () => void;
}

// Test scenario prompts
const TEST_SCENARIOS = [
  { id: "appointment", label: "Schedule Appointment", prompt: "I'd like to schedule an appointment" },
  { id: "hours", label: "Ask Hours", prompt: "What are your hours of operation?" },
  { id: "pricing", label: "Pricing", prompt: "I have a question about pricing" },
  { id: "emergency", label: "Emergency", prompt: "This is an emergency" },
];

export function TestCall({ assistantData, onTestComplete }: TestCallProps) {
  const [duration, setDuration] = useState(0);
  const [isVapiAvailable, setIsVapiAvailable] = useState<boolean | null>(null);

  // Settings state
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [maxDuration, setMaxDuration] = useState(3); // minutes
  const [selectedScenario, setSelectedScenario] = useState<string | null>(null);

  // Audio device state
  const [microphones, setMicrophones] = useState<AudioDevice[]>([]);
  const [speakers, setSpeakers] = useState<AudioDevice[]>([]);
  const [selectedMic, setSelectedMic] = useState<string>("default");
  const [selectedSpeaker, setSelectedSpeaker] = useState<string>("default");
  const [supportsOutputSelection, setSupportsOutputSelection] = useState(false);

  // Voice preview state
  const [isPreviewPlaying, setIsPreviewPlaying] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);

  const durationIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const hasInitializedRef = useRef(false);
  const autoEndTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const {
    status,
    isMuted,
    transcript,
    error,
    volumeLevel,
    isAssistantSpeaking,
    initialize,
    startWithConfig,
    stop,
    toggleMute,
    reset,
  } = useVapi();

  // Load audio devices on mount
  useEffect(() => {
    async function loadDevices() {
      // Request permission first to get device labels
      await requestMicrophonePermission();

      const devices = await getAudioDevices();
      setMicrophones(devices.microphones);
      setSpeakers(devices.speakers);
      setSupportsOutputSelection(supportsOutputDeviceSelection());

      // Restore saved preferences
      const savedMic = getSelectedMicrophone();
      const savedSpeaker = getSelectedSpeaker();

      if (savedMic && devices.microphones.some(d => d.deviceId === savedMic)) {
        setSelectedMic(savedMic);
      }
      if (savedSpeaker && devices.speakers.some(d => d.deviceId === savedSpeaker)) {
        setSelectedSpeaker(savedSpeaker);
      }
    }

    loadDevices();
  }, []);

  // Check if Vapi public key is available and initialize
  useEffect(() => {
    const publicKey = process.env.NEXT_PUBLIC_VAPI_PUBLIC_KEY;
    if (publicKey && !hasInitializedRef.current) {
      hasInitializedRef.current = true;
      initialize(publicKey);
      setIsVapiAvailable(true);
    } else if (!publicKey) {
      setIsVapiAvailable(false);
    }
  }, [initialize]);

  // Handle duration tracking and auto-end
  useEffect(() => {
    if (status === "active") {
      durationIntervalRef.current = setInterval(() => {
        setDuration((d) => {
          const newDuration = d + 1;
          // Check if we've reached max duration
          if (newDuration >= maxDuration * 60) {
            stop();
          }
          return newDuration;
        });
      }, 1000);
    } else {
      if (durationIntervalRef.current) {
        clearInterval(durationIntervalRef.current);
        durationIntervalRef.current = null;
      }
    }

    return () => {
      if (durationIntervalRef.current) {
        clearInterval(durationIntervalRef.current);
      }
      if (autoEndTimeoutRef.current) {
        clearTimeout(autoEndTimeoutRef.current);
      }
    };
  }, [status, maxDuration, stop]);

  // Clean up voice preview on unmount
  useEffect(() => {
    return () => {
      stopVoicePreview();
    };
  }, []);

  const handleMicChange = useCallback((deviceId: string) => {
    setSelectedMic(deviceId);
    saveSelectedMicrophone(deviceId);
  }, []);

  const handleSpeakerChange = useCallback((deviceId: string) => {
    setSelectedSpeaker(deviceId);
    saveSelectedSpeaker(deviceId);
  }, []);

  const handleVoicePreview = useCallback(async () => {
    if (isPreviewPlaying) {
      stopVoicePreview();
      setIsPreviewPlaying(false);
      return;
    }

    setPreviewError(null);
    await playVoicePreview(assistantData.voiceId || "EXAVITQu4vr4xnSDxMaL", {
      outputDeviceId: selectedSpeaker !== "default" ? selectedSpeaker : undefined,
      onStart: () => setIsPreviewPlaying(true),
      onEnd: () => setIsPreviewPlaying(false),
      onError: (err) => {
        setIsPreviewPlaying(false);
        setPreviewError(err);
      },
    });
  }, [assistantData.voiceId, selectedSpeaker, isPreviewPlaying]);

  const handleStartCall = async () => {
    setDuration(0);

    // Build system prompt with scenario context if selected
    let systemPrompt = assistantData.systemPrompt;
    if (selectedScenario) {
      const scenario = TEST_SCENARIOS.find(s => s.id === selectedScenario);
      if (scenario) {
        systemPrompt += `\n\n[TEST SCENARIO: The caller is likely going to say: "${scenario.prompt}"]`;
      }
    }

    // Start with inline configuration for the test call
    await startWithConfig({
      model: {
        provider: "openai",
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: systemPrompt,
          },
        ],
      },
      voice: {
        provider: "11labs",
        voiceId: assistantData.voiceId || "EXAVITQu4vr4xnSDxMaL", // Default to Sarah
      },
      overrides: {
        firstMessage: assistantData.firstMessage,
        recordingEnabled: false, // Don't record test calls
      },
      audioDevices: {
        inputDeviceId: selectedMic !== "default" ? selectedMic : undefined,
        outputDeviceId: selectedSpeaker !== "default" ? selectedSpeaker : undefined,
      },
    });
  };

  const handleEndCall = () => {
    stop();
  };

  const handleTryAgain = () => {
    setDuration(0);
    setSelectedScenario(null);
    reset();
  };

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  // Get voice info for display
  const selectedVoice = getVoiceById(assistantData.voiceId) || VOICE_OPTIONS[0];

  // Calculate remaining time
  const maxDurationSeconds = maxDuration * 60;
  const remainingSeconds = Math.max(0, maxDurationSeconds - duration);
  const isNearingLimit = status === "active" && remainingSeconds <= 30;

  // Map status for display
  const displayStatus = status === "error" ? "idle" : status;

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h3 className="text-lg font-medium">Test Your AI Receptionist</h3>
        <p className="text-sm text-muted-foreground">
          Have a conversation with your AI to make sure it sounds right
        </p>
      </div>

      {/* Vapi Not Available Warning */}
      {isVapiAvailable === false && (
        <Alert>
          <Info className="h-4 w-4" />
          <AlertDescription>
            Voice testing is not configured. You can skip this step and test your
            assistant later from the dashboard once a phone number is assigned.
          </AlertDescription>
        </Alert>
      )}

      {/* Voice Preview */}
      {displayStatus === "idle" && isVapiAvailable !== false && (
        <Card className="p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Volume2 className="h-5 w-5 text-muted-foreground" />
              <div>
                <p className="font-medium">{selectedVoice.name}</p>
                <p className="text-sm text-muted-foreground">{selectedVoice.description}</p>
              </div>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={handleVoicePreview}
              disabled={isPreviewPlaying && !isVoicePreviewPlaying()}
            >
              {isPreviewPlaying ? (
                <>
                  <Square className="mr-2 h-4 w-4" />
                  Stop
                </>
              ) : (
                <>
                  <Play className="mr-2 h-4 w-4" />
                  Preview
                </>
              )}
            </Button>
          </div>
          {previewError && (
            <p className="mt-2 text-sm text-destructive">{previewError}</p>
          )}
        </Card>
      )}

      {/* Settings Panel */}
      {displayStatus === "idle" && isVapiAvailable !== false && (
        <Collapsible open={settingsOpen} onOpenChange={setSettingsOpen}>
          <CollapsibleTrigger asChild>
            <Button variant="ghost" className="w-full justify-between">
              <div className="flex items-center gap-2">
                <Settings className="h-4 w-4" />
                <span>Settings</span>
              </div>
              <ChevronDown
                className={`h-4 w-4 transition-transform ${
                  settingsOpen ? "rotate-180" : ""
                }`}
              />
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <Card className="mt-2 p-4 space-y-4">
              {/* Microphone Selection */}
              <div className="space-y-2">
                <Label htmlFor="microphone">Microphone</Label>
                <Select value={selectedMic} onValueChange={handleMicChange}>
                  <SelectTrigger id="microphone">
                    <SelectValue placeholder="Select microphone" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="default">Default Device</SelectItem>
                    {microphones.map((mic) => (
                      <SelectItem key={mic.deviceId} value={mic.deviceId}>
                        {mic.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Speaker Selection */}
              {supportsOutputSelection && (
                <div className="space-y-2">
                  <Label htmlFor="speaker">Speaker</Label>
                  <Select value={selectedSpeaker} onValueChange={handleSpeakerChange}>
                    <SelectTrigger id="speaker">
                      <SelectValue placeholder="Select speaker" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="default">Default Device</SelectItem>
                      {speakers.map((speaker) => (
                        <SelectItem key={speaker.deviceId} value={speaker.deviceId}>
                          {speaker.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {/* Max Duration Slider */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>Max Duration</Label>
                  <span className="text-sm text-muted-foreground">
                    {maxDuration} min
                  </span>
                </div>
                <Slider
                  value={[maxDuration]}
                  onValueChange={(value) => setMaxDuration(value[0])}
                  min={1}
                  max={5}
                  step={1}
                />
                <p className="text-xs text-muted-foreground">
                  Call will auto-end when limit is reached
                </p>
              </div>
            </Card>
          </CollapsibleContent>
        </Collapsible>
      )}

      {/* Test Scenarios */}
      {displayStatus === "idle" && isVapiAvailable !== false && (
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <MessageSquare className="h-4 w-4" />
            <span>Try a scenario:</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {TEST_SCENARIOS.map((scenario) => (
              <Button
                key={scenario.id}
                variant={selectedScenario === scenario.id ? "default" : "outline"}
                size="sm"
                onClick={() =>
                  setSelectedScenario(
                    selectedScenario === scenario.id ? null : scenario.id
                  )
                }
              >
                {scenario.label}
              </Button>
            ))}
          </div>
          {selectedScenario && (
            <p className="text-sm text-muted-foreground italic">
              &quot;{TEST_SCENARIOS.find(s => s.id === selectedScenario)?.prompt}&quot;
            </p>
          )}
        </div>
      )}

      {/* Call Status Card */}
      <Card className="p-6">
        <div className="flex flex-col items-center space-y-4">
          {displayStatus === "idle" && (
            <>
              <div className="flex h-20 w-20 items-center justify-center rounded-full bg-primary/10">
                <Phone className="h-10 w-10 text-primary" />
              </div>
              <p className="text-center text-muted-foreground">
                {isVapiAvailable === false
                  ? "Voice testing is not available at the moment"
                  : "Click the button below to start a test call with your AI receptionist"}
              </p>
              <Button
                size="lg"
                onClick={handleStartCall}
                disabled={isVapiAvailable === false}
              >
                <Phone className="mr-2 h-5 w-5" />
                Start Test Call
              </Button>
            </>
          )}

          {displayStatus === "connecting" && (
            <>
              <div className="flex h-20 w-20 items-center justify-center rounded-full bg-yellow-500/10">
                <Loader2 className="h-10 w-10 animate-spin text-yellow-500" />
              </div>
              <p className="text-center text-muted-foreground">
                Connecting to your AI receptionist...
              </p>
              <Badge variant="secondary">Requesting microphone access</Badge>
            </>
          )}

          {displayStatus === "active" && (
            <>
              <div
                className={`flex h-20 w-20 items-center justify-center rounded-full transition-all ${
                  isAssistantSpeaking
                    ? "bg-green-500/20 scale-105"
                    : "bg-green-500/10"
                }`}
              >
                <Phone className="h-10 w-10 text-green-500" />
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="default" className="bg-green-500">
                  Call Active
                </Badge>
                <Badge variant={isNearingLimit ? "destructive" : "outline"}>
                  {formatDuration(duration)} / {maxDuration}:00
                </Badge>
              </div>

              {/* Volume indicator */}
              {isAssistantSpeaking && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Volume2 className="h-4 w-4" />
                  <div className="h-2 w-20 rounded-full bg-muted overflow-hidden">
                    <div
                      className="h-full bg-green-500 transition-all"
                      style={{ width: `${Math.min(volumeLevel * 100, 100)}%` }}
                    />
                  </div>
                </div>
              )}

              {/* Nearing limit warning */}
              {isNearingLimit && (
                <p className="text-sm text-destructive">
                  Call ending in {remainingSeconds} seconds
                </p>
              )}

              <div className="flex gap-2">
                <Button variant="outline" size="icon" onClick={toggleMute}>
                  {isMuted ? (
                    <MicOff className="h-5 w-5 text-destructive" />
                  ) : (
                    <Mic className="h-5 w-5" />
                  )}
                </Button>
                <Button variant="destructive" onClick={handleEndCall}>
                  <PhoneOff className="mr-2 h-5 w-5" />
                  End Call
                </Button>
              </div>
            </>
          )}

          {displayStatus === "ended" && (
            <>
              <div className="flex h-20 w-20 items-center justify-center rounded-full bg-primary/10">
                <CheckCircle2 className="h-10 w-10 text-primary" />
              </div>
              <p className="text-center font-medium">Test call completed!</p>
              <p className="text-center text-sm text-muted-foreground">
                Duration: {formatDuration(duration)}
              </p>
              <div className="flex gap-2">
                <Button variant="outline" onClick={handleTryAgain}>
                  Try Again
                </Button>
                <Button onClick={onTestComplete}>Sounds Good, Continue</Button>
              </div>
            </>
          )}
        </div>
      </Card>

      {/* Transcript */}
      {transcript.length > 0 && (
        <Card className="p-4">
          <h4 className="mb-3 text-sm font-medium">Conversation Transcript</h4>
          <div className="max-h-48 space-y-2 overflow-y-auto">
            {transcript.map((message, index) => (
              <div
                key={index}
                className={`rounded-lg p-2 text-sm ${
                  message.role === "assistant"
                    ? "bg-primary/10 text-primary"
                    : "bg-muted"
                }`}
              >
                <span className="font-medium">
                  {message.role === "assistant" ? "AI: " : "You: "}
                </span>
                {message.content}
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Error Display */}
      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Skip Option */}
      {displayStatus === "idle" && (
        <div className="text-center">
          <Button variant="ghost" size="sm" onClick={onTestComplete}>
            Skip for now
          </Button>
          <p className="mt-1 text-xs text-muted-foreground">
            You can always test your assistant later
          </p>
        </div>
      )}
    </div>
  );
}
