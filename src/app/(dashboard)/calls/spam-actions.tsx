"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ShieldAlert, ShieldCheck, MoreVertical, Loader2 } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";

interface SpamActionsProps {
  callId: string;
  isSpam: boolean;
}

export function SpamActions({ callId, isSpam }: SpamActionsProps) {
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();
  const { toast } = useToast();

  const handleMarkAsSpam = async () => {
    setIsLoading(true);
    try {
      const response = await fetch(`/api/v1/calls/${callId}/spam`, {
        method: "POST",
      });

      if (!response.ok) {
        throw new Error("Failed to mark call as spam");
      }

      toast({
        title: "Marked as spam",
        description: "This call has been marked as spam. Future calls from this number will be flagged.",
      });

      router.refresh();
    } catch {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to mark call as spam. Please try again.",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleMarkAsNotSpam = async () => {
    setIsLoading(true);
    try {
      const response = await fetch(`/api/v1/calls/${callId}/spam`, {
        method: "DELETE",
      });

      if (!response.ok) {
        throw new Error("Failed to update call");
      }

      toast({
        title: "Marked as not spam",
        description: "This call has been marked as legitimate.",
      });

      router.refresh();
    } catch {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to update call. Please try again.",
      });
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading) {
    return (
      <Button variant="ghost" size="icon" disabled>
        <Loader2 className="h-4 w-4 animate-spin" />
      </Button>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon">
          <MoreVertical className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {isSpam ? (
          <DropdownMenuItem onClick={handleMarkAsNotSpam}>
            <ShieldCheck className="h-4 w-4 mr-2 text-green-600" />
            Mark as Not Spam
          </DropdownMenuItem>
        ) : (
          <DropdownMenuItem onClick={handleMarkAsSpam}>
            <ShieldAlert className="h-4 w-4 mr-2 text-orange-600" />
            Mark as Spam
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
