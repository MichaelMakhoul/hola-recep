"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { ChevronDown, ChevronRight, AlertTriangle, RotateCcw } from "lucide-react";

interface AdvancedPromptEditorProps {
  generatedPrompt: string;
  isManuallyEdited: boolean;
  onManualEdit: (prompt: string) => void;
  onReset: () => void;
}

export function AdvancedPromptEditor({
  generatedPrompt,
  isManuallyEdited,
  onManualEdit,
  onReset,
}: AdvancedPromptEditorProps) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <CollapsibleTrigger asChild>
        <Button variant="ghost" className="w-full justify-between px-0 hover:bg-transparent">
          <span className="text-sm font-medium">Advanced: View / Edit Prompt</span>
          {isOpen ? (
            <ChevronDown className="h-4 w-4" />
          ) : (
            <ChevronRight className="h-4 w-4" />
          )}
        </Button>
      </CollapsibleTrigger>

      <CollapsibleContent className="space-y-3">
        {isManuallyEdited && (
          <div className="flex items-start gap-2 rounded-md bg-amber-50 dark:bg-amber-950/50 p-3 text-sm">
            <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
            <div>
              <p className="font-medium text-amber-800 dark:text-amber-200">
                Manual edits override the guided builder
              </p>
              <p className="text-amber-700 dark:text-amber-300 text-xs mt-0.5">
                Changes above won&apos;t update this prompt until you reset.
              </p>
            </div>
          </div>
        )}

        <Textarea
          value={generatedPrompt}
          onChange={(e) => onManualEdit(e.target.value)}
          rows={12}
          className="font-mono text-xs"
          placeholder="System prompt will appear here..."
        />

        {isManuallyEdited && (
          <Button variant="outline" size="sm" onClick={onReset}>
            <RotateCcw className="h-3.5 w-3.5 mr-1" />
            Reset to Guided
          </Button>
        )}
      </CollapsibleContent>
    </Collapsible>
  );
}
