export type VerificationMethod =
  | "read-back-digits"
  | "spell-out"
  | "repeat-confirm"
  | "read-back-characters"
  | "none";

export type FieldType =
  | "text"
  | "phone"
  | "email"
  | "date"
  | "number"
  | "select"
  | "address";

export type FieldCategory =
  | "universal"
  | "medical"
  | "dental"
  | "legal"
  | "home_services"
  | "real_estate"
  | "salon"
  | "automotive"
  | "veterinary"
  | "restaurant"
  | "other";

export type TonePreset = "professional" | "friendly" | "casual";

export interface CollectionField {
  id: string;
  label: string;
  type: FieldType;
  required: boolean;
  verification: VerificationMethod;
  category: FieldCategory;
  description?: string;
}

export interface BehaviorToggles {
  scheduleAppointments: boolean;
  handleEmergencies: boolean;
  providePricingInfo: boolean;
  takeMessages: boolean;
  transferToHuman: boolean;
  afterHoursHandling: boolean;
}

export interface PromptConfig {
  version: 1;
  fields: CollectionField[];
  behaviors: BehaviorToggles;
  tone: TonePreset;
  customInstructions: string;
  isManuallyEdited: boolean;
}
