"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useToast } from "@/components/ui/use-toast";
import {
  Loader2,
  Phone,
  Copy,
  Check,
  ArrowRight,
  AlertCircle,
} from "lucide-react";
import { formatPhoneNumber } from "@/lib/utils";
import {
  getCarrierById,
  getCarriersForCountry,
  validatePhoneForCountry,
  formatInstructions,
  type CarrierInfo,
} from "@/lib/country-config";

interface Assistant {
  id: string;
  name: string;
}

interface ForwardingSetupDialogProps {
  assistants: Assistant[];
  countryCode?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type Step =
  | "enter_number"
  | "select_carrier"
  | "assign_assistant"
  | "provisioning"
  | "instructions"
  | "confirm";

interface ProvisionedResult {
  id: string;
  phone_number: string;
}

export function ForwardingSetupDialog({
  assistants,
  countryCode = "US",
  open,
  onOpenChange,
}: ForwardingSetupDialogProps) {
  const countryCarriers = getCarriersForCountry(countryCode);
  const [step, setStep] = useState<Step>("enter_number");
  const [userPhone, setUserPhone] = useState("");
  const [carrierId, setCarrierId] = useState("");
  const [assistantId, setAssistantId] = useState("");
  const [friendlyName, setFriendlyName] = useState("");
  const [isProvisioning, setIsProvisioning] = useState(false);
  const [provisionError, setProvisionError] = useState<string | null>(null);
  const [provisioned, setProvisioned] = useState<ProvisionedResult | null>(null);
  const [copiedText, setCopiedText] = useState<string | null>(null);
  const [isConfirming, setIsConfirming] = useState(false);
  const router = useRouter();
  const { toast } = useToast();

  const selectedCarrier = carrierId
    ? countryCarriers.find((c) => c.id === carrierId) || getCarrierById(carrierId)
    : undefined;

  const cleanPhone = userPhone.replace(/\D/g, "");
  const isValidPhone = validatePhoneForCountry(cleanPhone, countryCode);

  const resetForm = () => {
    setStep("enter_number");
    setUserPhone("");
    setCarrierId("");
    setAssistantId("");
    setFriendlyName("");
    setIsProvisioning(false);
    setProvisionError(null);
    setProvisioned(null);
    setCopiedText(null);
    setIsConfirming(false);
  };

  const handleProvision = async () => {
    setStep("provisioning");
    setIsProvisioning(true);
    setProvisionError(null);

    try {
      const response = await fetch("/api/v1/phone-numbers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sourceType: "forwarded",
          userPhoneNumber: userPhone,
          carrier: carrierId,
          assistantId: assistantId || undefined,
          friendlyName: friendlyName || undefined,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to provision forwarding number");
      }

      const result = await response.json();
      setProvisioned({ id: result.id, phone_number: result.phone_number });
      setStep("instructions");
    } catch (error) {
      setProvisionError(
        error instanceof Error ? error.message : "Failed to provision number"
      );
      setStep("assign_assistant");
    } finally {
      setIsProvisioning(false);
    }
  };

  const handleCopy = async (text: string) => {
    await navigator.clipboard.writeText(text);
    setCopiedText(text);
    setTimeout(() => setCopiedText(null), 2000);
  };

  const handleConfirm = async (confirmed: boolean) => {
    if (!provisioned) return;

    if (confirmed) {
      setIsConfirming(true);
      try {
        const resp = await fetch(`/api/v1/phone-numbers/${provisioned.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ forwardingStatus: "active" }),
        });
        if (!resp.ok) {
          throw new Error("Failed to update forwarding status");
        }
        toast({
          title: "Forwarding set up!",
          description: `Calls to ${formatPhoneNumber(userPhone, countryCode)} will be forwarded to your AI assistant.`,
        });
      } catch {
        toast({
          variant: "destructive",
          title: "Error",
          description: "Failed to update forwarding status",
        });
      } finally {
        setIsConfirming(false);
      }
    } else {
      toast({
        title: "Number provisioned",
        description: "You can set up forwarding later from the phone numbers page.",
      });
    }

    onOpenChange(false);
    resetForm();
    router.refresh();
  };

  const renderDialCode = (
    carrier: CarrierInfo,
    type: "conditional" | "unconditional",
    destinationNumber: string
  ) => {
    const inst = carrier.instructions[type];
    const enableCode = formatInstructions(inst.enable, destinationNumber);
    const disableCode = formatInstructions(inst.disable, destinationNumber);

    return (
      <div className="space-y-3">
        <div className="space-y-2">
          <Label className="text-xs font-medium text-muted-foreground">
            To enable forwarding, dial:
          </Label>
          <div className="flex items-center gap-2">
            <code className="flex-1 rounded-md bg-muted px-3 py-2 font-mono text-sm">
              {enableCode}
            </code>
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8 shrink-0"
              onClick={() => handleCopy(enableCode)}
            >
              {copiedText === enableCode ? (
                <Check className="h-3.5 w-3.5" />
              ) : (
                <Copy className="h-3.5 w-3.5" />
              )}
            </Button>
          </div>
        </div>
        <div className="space-y-2">
          <Label className="text-xs font-medium text-muted-foreground">
            To disable forwarding later:
          </Label>
          <div className="flex items-center gap-2">
            <code className="flex-1 rounded-md bg-muted px-3 py-2 font-mono text-sm">
              {disableCode}
            </code>
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8 shrink-0"
              onClick={() => handleCopy(disableCode)}
            >
              {copiedText === disableCode ? (
                <Check className="h-3.5 w-3.5" />
              ) : (
                <Copy className="h-3.5 w-3.5" />
              )}
            </Button>
          </div>
        </div>
        <p className="text-xs text-muted-foreground">{inst.note}</p>
      </div>
    );
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(isOpen) => {
        if (!isOpen) resetForm();
        onOpenChange(isOpen);
      }}
    >
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>
            {step === "enter_number" && "Enter Your Phone Number"}
            {step === "select_carrier" && "Select Your Carrier"}
            {step === "assign_assistant" && "Configure Forwarding"}
            {step === "provisioning" && "Setting Up Forwarding"}
            {step === "instructions" && "Forwarding Instructions"}
            {step === "confirm" && "Confirm Setup"}
          </DialogTitle>
          <DialogDescription>
            {step === "enter_number" &&
              "Enter the business phone number you want to forward to your AI assistant"}
            {step === "select_carrier" &&
              "Select your phone carrier so we can show the correct dial codes"}
            {step === "assign_assistant" &&
              "Optionally assign an assistant and give this number a name"}
            {step === "provisioning" &&
              "Provisioning a destination number for your calls..."}
            {step === "instructions" &&
              "Follow these instructions to set up call forwarding on your phone"}
            {step === "confirm" &&
              "Have you completed the forwarding setup on your phone?"}
          </DialogDescription>
        </DialogHeader>

        {/* Step: Enter Phone Number */}
        {step === "enter_number" && (
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="userPhone">Your Business Phone Number</Label>
              <Input
                id="userPhone"
                placeholder="(555) 123-4567"
                value={userPhone}
                onChange={(e) => setUserPhone(e.target.value)}
                type="tel"
              />
              {userPhone && !isValidPhone && (
                <p className="text-xs text-destructive">
                  Enter a valid phone number
                </p>
              )}
            </div>
          </div>
        )}

        {/* Step: Select Carrier */}
        {step === "select_carrier" && (
          <div className="space-y-3 py-4">
            {countryCarriers.map((carrier) => (
              <button
                key={carrier.id}
                type="button"
                onClick={() => setCarrierId(carrier.id)}
                className={`flex w-full items-center gap-3 rounded-lg border p-3 text-left transition-colors ${
                  carrierId === carrier.id
                    ? "border-primary bg-primary/5"
                    : "hover:bg-muted"
                }`}
              >
                <div
                  className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-medium ${
                    carrierId === carrier.id
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted"
                  }`}
                >
                  {carrier.name.charAt(0)}
                </div>
                <span className="font-medium">{carrier.name}</span>
              </button>
            ))}
          </div>
        )}

        {/* Step: Assign Assistant */}
        {step === "assign_assistant" && (
          <div className="space-y-4 py-4">
            {provisionError && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{provisionError}</AlertDescription>
              </Alert>
            )}

            <div className="rounded-lg bg-muted p-3">
              <div className="flex items-center gap-2">
                <Phone className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium">
                  {formatPhoneNumber(userPhone, countryCode)}
                </span>
                <ArrowRight className="h-3 w-3 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">
                  AI Assistant
                </span>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                Carrier: {selectedCarrier?.name}
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="fwdFriendlyName">Friendly Name (optional)</Label>
              <Input
                id="fwdFriendlyName"
                placeholder="e.g., Main Office Line"
                value={friendlyName}
                onChange={(e) => setFriendlyName(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="fwdAssistant">
                Assign to Assistant (optional)
              </Label>
              <Select
                value={assistantId || "none"}
                onValueChange={(v) => setAssistantId(v === "none" ? "" : v)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select an assistant" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No assistant</SelectItem>
                  {assistants.map((assistant) => (
                    <SelectItem key={assistant.id} value={assistant.id}>
                      {assistant.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        )}

        {/* Step: Provisioning */}
        {step === "provisioning" && (
          <div className="flex flex-col items-center gap-4 py-8">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">
              Provisioning a destination number...
            </p>
          </div>
        )}

        {/* Step: Instructions */}
        {step === "instructions" && provisioned && selectedCarrier && (
          <div className="space-y-4 py-4">
            <div className="rounded-lg bg-primary/5 border border-primary/20 p-4 text-center">
              <p className="text-xs font-medium text-muted-foreground">
                Forward calls to this number:
              </p>
              <p className="mt-1 text-xl font-bold">
                {formatPhoneNumber(provisioned.phone_number, countryCode)}
              </p>
            </div>

            <Tabs defaultValue="conditional">
              <TabsList className="w-full">
                <TabsTrigger value="conditional" className="flex-1">
                  When Busy / No Answer
                </TabsTrigger>
                <TabsTrigger value="unconditional" className="flex-1">
                  Always Forward
                </TabsTrigger>
              </TabsList>
              <TabsContent value="conditional" className="mt-3">
                {renderDialCode(
                  selectedCarrier,
                  "conditional",
                  provisioned.phone_number.replace(/\D/g, "")
                )}
              </TabsContent>
              <TabsContent value="unconditional" className="mt-3">
                {renderDialCode(
                  selectedCarrier,
                  "unconditional",
                  provisioned.phone_number.replace(/\D/g, "")
                )}
              </TabsContent>
            </Tabs>

            <Alert>
              <Phone className="h-4 w-4" />
              <AlertDescription>
                Open your phone&apos;s dialer, enter the code above, and press
                call. You should hear a confirmation tone or message.
              </AlertDescription>
            </Alert>
          </div>
        )}

        {/* Step: Confirm */}
        {step === "confirm" && (
          <div className="space-y-4 py-4">
            <div className="rounded-lg border p-4 text-center">
              <Check className="mx-auto h-10 w-10 text-green-500" />
              <p className="mt-2 text-sm font-medium">
                Did you dial the forwarding code on your phone?
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                If you haven&apos;t set it up yet, you can do it later from the
                phone numbers page.
              </p>
            </div>
          </div>
        )}

        <DialogFooter>
          {step === "enter_number" && (
            <Button onClick={() => setStep("select_carrier")} disabled={!isValidPhone}>
              Continue
            </Button>
          )}
          {step === "select_carrier" && (
            <>
              <Button
                variant="outline"
                onClick={() => setStep("enter_number")}
              >
                Back
              </Button>
              <Button
                onClick={() => setStep("assign_assistant")}
                disabled={!carrierId}
              >
                Continue
              </Button>
            </>
          )}
          {step === "assign_assistant" && (
            <>
              <Button
                variant="outline"
                onClick={() => setStep("select_carrier")}
              >
                Back
              </Button>
              <Button onClick={handleProvision} disabled={isProvisioning}>
                {isProvisioning && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                Set Up Forwarding
              </Button>
            </>
          )}
          {step === "instructions" && (
            <Button onClick={() => setStep("confirm")}>
              I&apos;ve Dialed the Code
            </Button>
          )}
          {step === "confirm" && (
            <>
              <Button
                variant="outline"
                onClick={() => handleConfirm(false)}
                disabled={isConfirming}
              >
                I&apos;ll Do This Later
              </Button>
              <Button
                onClick={() => handleConfirm(true)}
                disabled={isConfirming}
              >
                {isConfirming && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                Yes, Forwarding Is Active
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
