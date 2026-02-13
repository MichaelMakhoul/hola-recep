"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Plus, X } from "lucide-react";
import type {
  CollectionField,
  FieldType,
  VerificationMethod,
} from "@/lib/prompt-builder/types";

interface FieldEditorProps {
  onAdd: (field: CollectionField) => void;
  onCancel: () => void;
}

const fieldTypes: { value: FieldType; label: string }[] = [
  { value: "text", label: "Text" },
  { value: "phone", label: "Phone Number" },
  { value: "email", label: "Email" },
  { value: "date", label: "Date" },
  { value: "number", label: "Number" },
  { value: "address", label: "Address" },
  { value: "select", label: "Selection / Choice" },
];

const verificationOptions: { value: VerificationMethod; label: string }[] = [
  { value: "none", label: "None" },
  { value: "repeat-confirm", label: "Repeat back & confirm" },
  { value: "read-back-digits", label: "Read back digit-by-digit" },
  { value: "spell-out", label: "Spell out letter-by-letter" },
  { value: "read-back-characters", label: "Read back character-by-character" },
];

function getDefaultVerification(type: FieldType): VerificationMethod {
  switch (type) {
    case "phone":
      return "read-back-digits";
    case "email":
      return "spell-out";
    case "address":
      return "repeat-confirm";
    default:
      return "none";
  }
}

export function FieldEditor({ onAdd, onCancel }: FieldEditorProps) {
  const [label, setLabel] = useState("");
  const [type, setType] = useState<FieldType>("text");
  const [required, setRequired] = useState(false);
  const [verification, setVerification] = useState<VerificationMethod>("none");

  const handleTypeChange = (newType: FieldType) => {
    setType(newType);
    setVerification(getDefaultVerification(newType));
  };

  const handleAdd = () => {
    if (!label.trim()) return;

    const field: CollectionField = {
      id: `custom_${Date.now()}`,
      label: label.trim(),
      type,
      required,
      verification,
      category: "other",
    };

    onAdd(field);
  };

  return (
    <div className="rounded-lg border bg-muted/30 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium">Add Custom Field</p>
        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={onCancel}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <Label className="text-xs">Field Label</Label>
          <Input
            placeholder="e.g., Membership ID"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            className="h-8 text-sm"
          />
        </div>

        <div className="space-y-1">
          <Label className="text-xs">Field Type</Label>
          <Select value={type} onValueChange={(v) => handleTypeChange(v as FieldType)}>
            <SelectTrigger className="h-8 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {fieldTypes.map((ft) => (
                <SelectItem key={ft.value} value={ft.value}>
                  {ft.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1">
          <Label className="text-xs">Verification</Label>
          <Select
            value={verification}
            onValueChange={(v) => setVerification(v as VerificationMethod)}
          >
            <SelectTrigger className="h-8 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {verificationOptions.map((vo) => (
                <SelectItem key={vo.value} value={vo.value}>
                  {vo.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center gap-2 self-end pb-1">
          <Switch
            id="required-toggle"
            checked={required}
            onCheckedChange={setRequired}
          />
          <Label htmlFor="required-toggle" className="text-xs">
            Required
          </Label>
        </div>
      </div>

      <Button size="sm" onClick={handleAdd} disabled={!label.trim()}>
        <Plus className="h-4 w-4 mr-1" />
        Add Field
      </Button>
    </div>
  );
}
