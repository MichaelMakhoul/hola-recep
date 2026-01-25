"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Phone, PhoneOff, Mic, MicOff, Volume2 } from "lucide-react";

// Demo industries with sample configurations
const DEMO_INDUSTRIES = [
  {
    id: "dental",
    name: "Dental Practice",
    description: "Experience how our AI handles dental appointment scheduling",
    greeting: "Thank you for calling Smile Dental Care! This is your AI receptionist. How can I help you today?",
    color: "bg-blue-500",
  },
  {
    id: "legal",
    name: "Law Firm",
    description: "See how we handle legal intake calls professionally",
    greeting: "Thank you for calling Johnson & Associates Law Firm. This is your virtual assistant. How may I direct your call?",
    color: "bg-purple-500",
  },
  {
    id: "home-services",
    name: "Home Services",
    description: "Watch our AI schedule plumbing and HVAC appointments",
    greeting: "Thanks for calling Reliable Home Services! I'm the AI assistant. Are you calling about plumbing, HVAC, or electrical service?",
    color: "bg-orange-500",
  },
];

// Simulated conversation for demo (when Vapi isn't configured)
const DEMO_CONVERSATIONS: Record<string, { role: "ai" | "user"; text: string }[]> = {
  dental: [
    { role: "ai", text: "Thank you for calling Smile Dental Care! This is your AI receptionist. How can I help you today?" },
    { role: "user", text: "Hi, I'd like to schedule a cleaning appointment." },
    { role: "ai", text: "I'd be happy to help you schedule a cleaning! Let me check our availability. Are you a new patient or have you visited us before?" },
    { role: "user", text: "I'm a new patient." },
    { role: "ai", text: "Welcome! For new patients, we have openings this Thursday at 10 AM, Friday at 2 PM, or next Monday at 9 AM. Which works best for you?" },
    { role: "user", text: "Thursday at 10 works great." },
    { role: "ai", text: "I've scheduled your new patient cleaning for Thursday at 10 AM. Can I get your name and phone number for our records?" },
  ],
  legal: [
    { role: "ai", text: "Thank you for calling Johnson & Associates Law Firm. This is your virtual assistant. How may I direct your call?" },
    { role: "user", text: "I need to speak with someone about a personal injury case." },
    { role: "ai", text: "I understand you have a personal injury matter. I can help schedule a free consultation with one of our attorneys. Can you briefly tell me what happened?" },
    { role: "user", text: "I was in a car accident last week." },
    { role: "ai", text: "I'm sorry to hear about your accident. Our personal injury team handles car accident cases. I have availability for a consultation tomorrow at 11 AM or Thursday at 3 PM. Would either of those work?" },
  ],
  "home-services": [
    { role: "ai", text: "Thanks for calling Reliable Home Services! I'm the AI assistant. Are you calling about plumbing, HVAC, or electrical service?" },
    { role: "user", text: "My AC isn't working and it's really hot." },
    { role: "ai", text: "I'm sorry to hear your AC is down! That's definitely uncomfortable. Let me get a technician out to you as soon as possible. Is this an emergency, or can it wait until tomorrow?" },
    { role: "user", text: "It's pretty urgent, we have a baby at home." },
    { role: "ai", text: "I completely understand - with a baby, you need that fixed right away. I'm checking our emergency schedule now. We can have a technician there within 2 hours. Can I get your address?" },
  ],
};

export default function DemoPage() {
  const [selectedIndustry, setSelectedIndustry] = useState<string | null>(null);
  const [isCallActive, setIsCallActive] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [conversationIndex, setConversationIndex] = useState(0);
  const [displayedMessages, setDisplayedMessages] = useState<{ role: "ai" | "user"; text: string }[]>([]);
  const [isTyping, setIsTyping] = useState(false);

  // Simulate conversation progression
  useEffect(() => {
    if (!isCallActive || !selectedIndustry) return;

    const conversation = DEMO_CONVERSATIONS[selectedIndustry];
    if (!conversation || conversationIndex >= conversation.length) return;

    const message = conversation[conversationIndex];
    const delay = message.role === "ai" ? 1500 : 2500; // AI responds faster

    setIsTyping(true);
    const timer = setTimeout(() => {
      setDisplayedMessages((prev) => [...prev, message]);
      setConversationIndex((prev) => prev + 1);
      setIsTyping(false);
    }, delay);

    return () => clearTimeout(timer);
  }, [isCallActive, selectedIndustry, conversationIndex]);

  const startDemo = useCallback((industryId: string) => {
    setSelectedIndustry(industryId);
    setIsCallActive(true);
    setConversationIndex(0);
    setDisplayedMessages([]);
    setIsMuted(false);
  }, []);

  const endDemo = useCallback(() => {
    setIsCallActive(false);
    setSelectedIndustry(null);
    setConversationIndex(0);
    setDisplayedMessages([]);
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-white">
      {/* Header */}
      <header className="border-b bg-white/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <Link href="/" className="text-2xl font-bold text-gray-900">
            Hola Recep
          </Link>
          <div className="flex items-center gap-4">
            <Link href="/login">
              <Button variant="ghost">Sign In</Button>
            </Link>
            <Link href="/signup">
              <Button>Start Free Trial</Button>
            </Link>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-12">
        {/* Hero Section */}
        <div className="text-center mb-12">
          <Badge className="mb-4" variant="secondary">
            Interactive Demo
          </Badge>
          <h1 className="text-4xl md:text-5xl font-bold text-gray-900 mb-4">
            Experience AI Reception
          </h1>
          <p className="text-xl text-gray-600 max-w-2xl mx-auto">
            See how our AI receptionist handles calls for different industries.
            Select a demo below to watch a simulated conversation.
          </p>
        </div>

        {/* Demo Selection or Active Call */}
        {!isCallActive ? (
          <div className="grid md:grid-cols-3 gap-6 max-w-5xl mx-auto">
            {DEMO_INDUSTRIES.map((industry) => (
              <Card
                key={industry.id}
                className="cursor-pointer hover:shadow-lg transition-shadow"
                onClick={() => startDemo(industry.id)}
              >
                <CardHeader>
                  <div className={`w-12 h-12 rounded-full ${industry.color} flex items-center justify-center mb-4`}>
                    <Phone className="w-6 h-6 text-white" />
                  </div>
                  <CardTitle>{industry.name}</CardTitle>
                  <CardDescription>{industry.description}</CardDescription>
                </CardHeader>
                <CardContent>
                  <Button className="w-full">
                    <Phone className="w-4 h-4 mr-2" />
                    Try Demo Call
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <div className="max-w-2xl mx-auto">
            {/* Active Call UI */}
            <Card className="mb-6">
              <CardHeader className="text-center border-b">
                <div className="flex items-center justify-center gap-2 mb-2">
                  <div className="w-3 h-3 bg-green-500 rounded-full animate-pulse" />
                  <span className="text-green-600 font-medium">Call in Progress</span>
                </div>
                <CardTitle>
                  {DEMO_INDUSTRIES.find((i) => i.id === selectedIndustry)?.name} Demo
                </CardTitle>
                <CardDescription>
                  Watch how our AI handles this call
                </CardDescription>
              </CardHeader>
              <CardContent className="p-6">
                {/* Conversation Display */}
                <div className="space-y-4 min-h-[300px] max-h-[400px] overflow-y-auto mb-6">
                  {displayedMessages.map((message, index) => (
                    <div
                      key={index}
                      className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}
                    >
                      <div
                        className={`max-w-[80%] rounded-lg px-4 py-2 ${
                          message.role === "user"
                            ? "bg-blue-500 text-white"
                            : "bg-gray-100 text-gray-900"
                        }`}
                      >
                        <div className="text-xs mb-1 opacity-70">
                          {message.role === "user" ? "Caller" : "AI Receptionist"}
                        </div>
                        <p>{message.text}</p>
                      </div>
                    </div>
                  ))}
                  {isTyping && (
                    <div className="flex justify-start">
                      <div className="bg-gray-100 rounded-lg px-4 py-2">
                        <div className="flex space-x-1">
                          <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" />
                          <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: "0.1s" }} />
                          <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: "0.2s" }} />
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Call Controls */}
                <div className="flex items-center justify-center gap-4">
                  <Button
                    variant="outline"
                    size="icon"
                    className="rounded-full w-12 h-12"
                    onClick={() => setIsMuted(!isMuted)}
                  >
                    {isMuted ? (
                      <MicOff className="w-5 h-5 text-red-500" />
                    ) : (
                      <Mic className="w-5 h-5" />
                    )}
                  </Button>
                  <Button
                    variant="destructive"
                    size="icon"
                    className="rounded-full w-16 h-16"
                    onClick={endDemo}
                  >
                    <PhoneOff className="w-6 h-6" />
                  </Button>
                  <Button
                    variant="outline"
                    size="icon"
                    className="rounded-full w-12 h-12"
                  >
                    <Volume2 className="w-5 h-5" />
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Call Info */}
            <div className="text-center">
              <p className="text-gray-500 mb-4">
                This is a simulated demo. Sign up for a free trial to test with your own business.
              </p>
              <div className="flex justify-center gap-4">
                <Button variant="outline" onClick={endDemo}>
                  Try Another Demo
                </Button>
                <Link href="/signup">
                  <Button>
                    Start Free Trial
                  </Button>
                </Link>
              </div>
            </div>
          </div>
        )}

        {/* Features Section */}
        <div className="mt-20 text-center">
          <h2 className="text-3xl font-bold text-gray-900 mb-8">
            Why Businesses Choose Hola Recep
          </h2>
          <div className="grid md:grid-cols-3 gap-8 max-w-4xl mx-auto">
            <div>
              <div className="text-4xl mb-4">24/7</div>
              <h3 className="font-semibold mb-2">Always Available</h3>
              <p className="text-gray-600">Never miss a call, even after hours or during busy periods</p>
            </div>
            <div>
              <div className="text-4xl mb-4">60%</div>
              <h3 className="font-semibold mb-2">Calls Saved</h3>
              <p className="text-gray-600">Small businesses miss 60% of calls - we catch them all</p>
            </div>
            <div>
              <div className="text-4xl mb-4">5 min</div>
              <h3 className="font-semibold mb-2">Setup Time</h3>
              <p className="text-gray-600">Get your AI receptionist running in under 5 minutes</p>
            </div>
          </div>
        </div>

        {/* CTA Section */}
        <div className="mt-20 text-center bg-gray-900 rounded-2xl p-12 text-white">
          <h2 className="text-3xl font-bold mb-4">
            Ready to Never Miss a Call Again?
          </h2>
          <p className="text-gray-300 mb-8 max-w-xl mx-auto">
            Start your 14-day free trial today. No credit card required.
            Set up in 5 minutes.
          </p>
          <Link href="/signup">
            <Button size="lg" variant="secondary">
              Start Free Trial
            </Button>
          </Link>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t mt-20 py-8">
        <div className="container mx-auto px-4 text-center text-gray-500">
          <p>&copy; {new Date().getFullYear()} Hola Recep. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}
