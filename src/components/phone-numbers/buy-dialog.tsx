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
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/components/ui/use-toast";
import { Plus, Phone, Loader2 } from "lucide-react";
import { formatPhoneNumber } from "@/lib/utils";

interface Assistant {
  id: string;
  name: string;
}

interface BuyPhoneNumberDialogProps {
  assistants: Assistant[];
}

interface AvailableNumber {
  number: string;
  locality?: string;
  region?: string;
}

export function BuyPhoneNumberDialog({ assistants }: BuyPhoneNumberDialogProps) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<"search" | "select" | "confirm">("search");
  const [areaCode, setAreaCode] = useState("");
  const [assistantId, setAssistantId] = useState<string>("");
  const [friendlyName, setFriendlyName] = useState("");
  const [availableNumbers, setAvailableNumbers] = useState<AvailableNumber[]>([]);
  const [selectedNumber, setSelectedNumber] = useState<AvailableNumber | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [isBuying, setIsBuying] = useState(false);
  const router = useRouter();
  const { toast } = useToast();

  const handleSearch = async () => {
    setIsSearching(true);
    try {
      const response = await fetch("/api/v1/phone-numbers/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          areaCode: areaCode || undefined,
          country: "US",
          limit: 10,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to search phone numbers");
      }

      const numbers = await response.json();
      setAvailableNumbers(numbers);
      setStep("select");
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to search for phone numbers",
      });
    } finally {
      setIsSearching(false);
    }
  };

  const handleSelectNumber = (number: AvailableNumber) => {
    setSelectedNumber(number);
    setStep("confirm");
  };

  const handleBuy = async () => {
    if (!selectedNumber) return;
    setIsBuying(true);

    try {
      const response = await fetch("/api/v1/phone-numbers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          areaCode,
          assistantId: assistantId || undefined,
          friendlyName: friendlyName || undefined,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Failed to purchase phone number");
      }

      toast({
        title: "Phone number purchased!",
        description: `${formatPhoneNumber(selectedNumber.number)} is now active.`,
      });

      setOpen(false);
      resetForm();
      router.refresh();
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to purchase phone number",
      });
    } finally {
      setIsBuying(false);
    }
  };

  const resetForm = () => {
    setStep("search");
    setAreaCode("");
    setAssistantId("");
    setFriendlyName("");
    setAvailableNumbers([]);
    setSelectedNumber(null);
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => {
      setOpen(isOpen);
      if (!isOpen) resetForm();
    }}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="mr-2 h-4 w-4" />
          Buy Number
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>
            {step === "search" && "Search Phone Numbers"}
            {step === "select" && "Select a Number"}
            {step === "confirm" && "Confirm Purchase"}
          </DialogTitle>
          <DialogDescription>
            {step === "search" && "Enter an area code to search for available numbers"}
            {step === "select" && "Choose from the available phone numbers"}
            {step === "confirm" && "Review and confirm your phone number purchase"}
          </DialogDescription>
        </DialogHeader>

        {step === "search" && (
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="areaCode">Area Code (optional)</Label>
              <Input
                id="areaCode"
                placeholder="e.g., 415"
                value={areaCode}
                onChange={(e) => setAreaCode(e.target.value)}
                maxLength={3}
              />
              <p className="text-xs text-muted-foreground">
                Leave blank to search any available numbers
              </p>
            </div>
          </div>
        )}

        {step === "select" && (
          <div className="max-h-[300px] space-y-2 overflow-y-auto py-4">
            {availableNumbers.length > 0 ? (
              availableNumbers.map((num) => (
                <button
                  key={num.number}
                  onClick={() => handleSelectNumber(num)}
                  className="flex w-full items-center justify-between rounded-lg border p-3 text-left transition-colors hover:bg-muted"
                >
                  <div className="flex items-center gap-3">
                    <Phone className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <p className="font-medium">{formatPhoneNumber(num.number)}</p>
                      {(num.locality || num.region) && (
                        <p className="text-xs text-muted-foreground">
                          {[num.locality, num.region].filter(Boolean).join(", ")}
                        </p>
                      )}
                    </div>
                  </div>
                </button>
              ))
            ) : (
              <p className="py-8 text-center text-muted-foreground">
                No numbers found. Try a different area code.
              </p>
            )}
          </div>
        )}

        {step === "confirm" && selectedNumber && (
          <div className="space-y-4 py-4">
            <div className="rounded-lg bg-muted p-4 text-center">
              <Phone className="mx-auto h-8 w-8 text-primary" />
              <p className="mt-2 text-xl font-bold">
                {formatPhoneNumber(selectedNumber.number)}
              </p>
              {(selectedNumber.locality || selectedNumber.region) && (
                <p className="text-sm text-muted-foreground">
                  {[selectedNumber.locality, selectedNumber.region].filter(Boolean).join(", ")}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="friendlyName">Friendly Name (optional)</Label>
              <Input
                id="friendlyName"
                placeholder="e.g., Main Office Line"
                value={friendlyName}
                onChange={(e) => setFriendlyName(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="assistant">Assign to Assistant (optional)</Label>
              <Select value={assistantId} onValueChange={setAssistantId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select an assistant" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">No assistant</SelectItem>
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

        <DialogFooter>
          {step === "search" && (
            <Button onClick={handleSearch} disabled={isSearching}>
              {isSearching && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Search Numbers
            </Button>
          )}
          {step === "select" && (
            <Button variant="outline" onClick={() => setStep("search")}>
              Back
            </Button>
          )}
          {step === "confirm" && (
            <>
              <Button variant="outline" onClick={() => setStep("select")}>
                Back
              </Button>
              <Button onClick={handleBuy} disabled={isBuying}>
                {isBuying && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Purchase Number
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
