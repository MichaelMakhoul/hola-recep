import { US_CONFIG } from "./countries/us";
import { AU_CONFIG } from "./countries/au";

// ── Types ──────────────────────────────────────────────────────────

export type CountryCode = "US" | "AU";

export interface PhoneConfig {
  countryCallingCode: string;
  placeholder: string;
  areaCodeLength: number;
  formatForDisplay(digits: string): string;
  validateNational(digits: string): boolean;
  extractAreaCode(digits: string): string | null;
}

export interface CarrierInfo {
  id: string;
  name: string;
  instructions: {
    conditional: { enable: string; disable: string; note: string };
    unconditional: { enable: string; disable: string; note: string };
  };
}

export interface TimezoneOption {
  value: string;
  label: string;
}

export interface AreaCodeSuggestion {
  code: string;
  location: string;
}

export interface CountryConfig {
  code: CountryCode;
  name: string;
  flag: string;
  phone: PhoneConfig;
  carriers: CarrierInfo[];
  timezones: TimezoneOption[];
  defaultTimezone: string;
  suggestedAreaCodes: AreaCodeSuggestion[];
  suspiciousAreaCodes: string[];
  locale: string;
  phoneProvider: "vapi" | "twilio";
  twilioCountryCode: string;
}

// ── Registry ───────────────────────────────────────────────────────

const COUNTRY_CONFIGS: Record<CountryCode, CountryConfig> = {
  US: US_CONFIG,
  AU: AU_CONFIG,
};

export const SUPPORTED_COUNTRIES: { code: CountryCode; name: string; flag: string }[] = [
  { code: "US", name: "United States", flag: "US" },
  { code: "AU", name: "Australia", flag: "AU" },
];

// ── Exports ────────────────────────────────────────────────────────

export function getCountryConfig(code: CountryCode | string): CountryConfig {
  const config = COUNTRY_CONFIGS[code as CountryCode];
  if (!config) {
    return COUNTRY_CONFIGS.US; // fallback
  }
  return config;
}

export function formatPhoneForCountry(phone: string, countryCode: CountryCode | string = "US"): string {
  return getCountryConfig(countryCode).phone.formatForDisplay(phone);
}

export function validatePhoneForCountry(phone: string, countryCode: CountryCode | string = "US"): boolean {
  return getCountryConfig(countryCode).phone.validateNational(phone);
}

export function getCarriersForCountry(countryCode: CountryCode | string = "US"): CarrierInfo[] {
  return getCountryConfig(countryCode).carriers;
}

export function getTimezonesForCountry(countryCode: CountryCode | string = "US"): TimezoneOption[] {
  return getCountryConfig(countryCode).timezones;
}
