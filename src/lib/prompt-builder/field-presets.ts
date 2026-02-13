import type { CollectionField, FieldCategory } from "./types";

// Universal fields — shown for all industries
export const universalFields: CollectionField[] = [
  {
    id: "full_name",
    label: "Full Name",
    type: "text",
    required: true,
    verification: "repeat-confirm",
    category: "universal",
  },
  {
    id: "phone_number",
    label: "Phone Number",
    type: "phone",
    required: true,
    verification: "read-back-digits",
    category: "universal",
  },
  {
    id: "email_address",
    label: "Email Address",
    type: "email",
    required: false,
    verification: "spell-out",
    category: "universal",
  },
];

// Medical-specific fields
const medicalFields: CollectionField[] = [
  {
    id: "dob",
    label: "Date of Birth",
    type: "date",
    required: true,
    verification: "repeat-confirm",
    category: "medical",
  },
  {
    id: "insurance_provider",
    label: "Insurance Provider",
    type: "text",
    required: true,
    verification: "repeat-confirm",
    category: "medical",
  },
  {
    id: "insurance_member_id",
    label: "Insurance Member ID",
    type: "text",
    required: false,
    verification: "read-back-characters",
    category: "medical",
  },
  {
    id: "medicare_card_number",
    label: "Medicare Card Number",
    type: "text",
    required: false,
    verification: "read-back-characters",
    category: "medical",
  },
  {
    id: "symptoms",
    label: "Symptoms",
    type: "text",
    required: false,
    verification: "repeat-confirm",
    category: "medical",
  },
  {
    id: "allergies",
    label: "Allergies",
    type: "text",
    required: false,
    verification: "repeat-confirm",
    category: "medical",
  },
  {
    id: "preferred_pharmacy",
    label: "Preferred Pharmacy",
    type: "text",
    required: false,
    verification: "repeat-confirm",
    category: "medical",
  },
  {
    id: "referring_doctor",
    label: "Referring Doctor",
    type: "text",
    required: false,
    verification: "repeat-confirm",
    category: "medical",
  },
];

// Dental-specific fields
const dentalFields: CollectionField[] = [
  {
    id: "dob",
    label: "Date of Birth",
    type: "date",
    required: true,
    verification: "repeat-confirm",
    category: "dental",
  },
  {
    id: "insurance_provider",
    label: "Insurance Provider",
    type: "text",
    required: true,
    verification: "repeat-confirm",
    category: "dental",
  },
  {
    id: "insurance_member_id",
    label: "Insurance Member ID",
    type: "text",
    required: false,
    verification: "read-back-characters",
    category: "dental",
  },
  {
    id: "reason_for_visit",
    label: "Reason for Visit",
    type: "text",
    required: true,
    verification: "repeat-confirm",
    category: "dental",
  },
  {
    id: "last_dental_visit",
    label: "Last Dental Visit",
    type: "text",
    required: false,
    verification: "none",
    category: "dental",
  },
];

// Legal-specific fields
const legalFields: CollectionField[] = [
  {
    id: "case_type",
    label: "Case Type",
    type: "text",
    required: true,
    verification: "repeat-confirm",
    category: "legal",
  },
  {
    id: "matter_description",
    label: "Matter Description",
    type: "text",
    required: true,
    verification: "repeat-confirm",
    category: "legal",
  },
  {
    id: "opposing_party",
    label: "Opposing Party",
    type: "text",
    required: false,
    verification: "repeat-confirm",
    category: "legal",
  },
  {
    id: "court_date",
    label: "Court Date",
    type: "date",
    required: false,
    verification: "repeat-confirm",
    category: "legal",
  },
  {
    id: "referral_source",
    label: "Referral Source",
    type: "text",
    required: false,
    verification: "none",
    category: "legal",
  },
];

// Home Services fields
const homeServicesFields: CollectionField[] = [
  {
    id: "service_address",
    label: "Service Address",
    type: "address",
    required: true,
    verification: "repeat-confirm",
    category: "home_services",
  },
  {
    id: "problem_description",
    label: "Problem Description",
    type: "text",
    required: true,
    verification: "repeat-confirm",
    category: "home_services",
  },
  {
    id: "urgency_level",
    label: "Urgency Level",
    type: "select",
    required: true,
    verification: "none",
    category: "home_services",
    description: "Routine, Urgent, or Emergency",
  },
  {
    id: "preferred_date_time",
    label: "Preferred Date/Time",
    type: "text",
    required: false,
    verification: "repeat-confirm",
    category: "home_services",
  },
  {
    id: "property_type",
    label: "Property Type",
    type: "select",
    required: false,
    verification: "none",
    category: "home_services",
    description: "House, Apartment, Commercial, etc.",
  },
];

// Real Estate fields
const realEstateFields: CollectionField[] = [
  {
    id: "property_address",
    label: "Property Address",
    type: "address",
    required: false,
    verification: "repeat-confirm",
    category: "real_estate",
  },
  {
    id: "budget_range",
    label: "Budget Range",
    type: "text",
    required: false,
    verification: "repeat-confirm",
    category: "real_estate",
  },
  {
    id: "property_type_re",
    label: "Property Type",
    type: "select",
    required: false,
    verification: "none",
    category: "real_estate",
    description: "Single-family, Condo, Townhouse, etc.",
  },
  {
    id: "buying_selling_renting",
    label: "Buying / Selling / Renting",
    type: "select",
    required: true,
    verification: "none",
    category: "real_estate",
  },
  {
    id: "timeline",
    label: "Timeline",
    type: "text",
    required: false,
    verification: "none",
    category: "real_estate",
  },
];

// Salon / Spa / Beauty fields
const salonFields: CollectionField[] = [
  {
    id: "appointment_type",
    label: "Appointment Type",
    type: "text",
    required: true,
    verification: "repeat-confirm",
    category: "salon",
  },
  {
    id: "preferred_stylist",
    label: "Preferred Stylist / Technician",
    type: "text",
    required: false,
    verification: "repeat-confirm",
    category: "salon",
  },
  {
    id: "service_requested",
    label: "Service Requested",
    type: "text",
    required: true,
    verification: "repeat-confirm",
    category: "salon",
  },
  {
    id: "hair_type_length",
    label: "Hair Type / Length",
    type: "text",
    required: false,
    verification: "none",
    category: "salon",
  },
  {
    id: "allergies_sensitivities",
    label: "Allergies / Sensitivities",
    type: "text",
    required: false,
    verification: "repeat-confirm",
    category: "salon",
  },
];

// Automotive / Mechanic fields
const automotiveFields: CollectionField[] = [
  {
    id: "vehicle_make",
    label: "Vehicle Make",
    type: "text",
    required: true,
    verification: "repeat-confirm",
    category: "automotive",
  },
  {
    id: "vehicle_model",
    label: "Vehicle Model",
    type: "text",
    required: true,
    verification: "repeat-confirm",
    category: "automotive",
  },
  {
    id: "vehicle_year",
    label: "Vehicle Year",
    type: "number",
    required: true,
    verification: "repeat-confirm",
    category: "automotive",
  },
  {
    id: "vin",
    label: "VIN",
    type: "text",
    required: false,
    verification: "read-back-characters",
    category: "automotive",
  },
  {
    id: "problem_description_auto",
    label: "Problem Description",
    type: "text",
    required: true,
    verification: "repeat-confirm",
    category: "automotive",
  },
  {
    id: "mileage",
    label: "Mileage",
    type: "number",
    required: false,
    verification: "repeat-confirm",
    category: "automotive",
  },
  {
    id: "insurance_claim",
    label: "Insurance Claim (Y/N)",
    type: "select",
    required: false,
    verification: "none",
    category: "automotive",
  },
];

// Veterinary / Pet Care fields
const veterinaryFields: CollectionField[] = [
  {
    id: "pet_name",
    label: "Pet Name",
    type: "text",
    required: true,
    verification: "repeat-confirm",
    category: "veterinary",
  },
  {
    id: "species",
    label: "Species",
    type: "select",
    required: true,
    verification: "none",
    category: "veterinary",
    description: "Dog, Cat, Bird, Reptile, etc.",
  },
  {
    id: "breed",
    label: "Breed",
    type: "text",
    required: false,
    verification: "repeat-confirm",
    category: "veterinary",
  },
  {
    id: "pet_age_weight",
    label: "Pet Age / Weight",
    type: "text",
    required: false,
    verification: "repeat-confirm",
    category: "veterinary",
  },
  {
    id: "pet_symptoms",
    label: "Symptoms",
    type: "text",
    required: false,
    verification: "repeat-confirm",
    category: "veterinary",
  },
  {
    id: "vaccination_status",
    label: "Vaccination Status",
    type: "text",
    required: false,
    verification: "none",
    category: "veterinary",
  },
  {
    id: "emergency_yn",
    label: "Emergency (Y/N)",
    type: "select",
    required: false,
    verification: "none",
    category: "veterinary",
  },
];

// Restaurant / Hospitality fields
const restaurantFields: CollectionField[] = [
  {
    id: "party_size",
    label: "Party Size",
    type: "number",
    required: true,
    verification: "repeat-confirm",
    category: "restaurant",
  },
  {
    id: "reservation_date_time",
    label: "Reservation Date / Time",
    type: "text",
    required: true,
    verification: "repeat-confirm",
    category: "restaurant",
  },
  {
    id: "dietary_restrictions",
    label: "Dietary Restrictions",
    type: "text",
    required: false,
    verification: "repeat-confirm",
    category: "restaurant",
  },
  {
    id: "event_type",
    label: "Event Type",
    type: "text",
    required: false,
    verification: "none",
    category: "restaurant",
    description: "Birthday, Anniversary, Business dinner, etc.",
  },
  {
    id: "seating_preference",
    label: "Seating Preference",
    type: "select",
    required: false,
    verification: "none",
    category: "restaurant",
    description: "Indoor, Outdoor, Bar, Private room",
  },
];

// Other / General fields
const otherFields: CollectionField[] = [
  {
    id: "address",
    label: "Address",
    type: "address",
    required: false,
    verification: "repeat-confirm",
    category: "other",
  },
  {
    id: "company_name",
    label: "Company Name",
    type: "text",
    required: false,
    verification: "repeat-confirm",
    category: "other",
  },
  {
    id: "reason_for_calling",
    label: "Reason for Calling",
    type: "text",
    required: true,
    verification: "none",
    category: "other",
  },
];

export const fieldPresetsByIndustry: Record<FieldCategory, CollectionField[]> = {
  universal: universalFields,
  medical: medicalFields,
  dental: dentalFields,
  legal: legalFields,
  home_services: homeServicesFields,
  real_estate: realEstateFields,
  salon: salonFields,
  automotive: automotiveFields,
  veterinary: veterinaryFields,
  restaurant: restaurantFields,
  other: otherFields,
};

export function getFieldsForIndustry(industry: string): {
  universal: CollectionField[];
  industry: CollectionField[];
} {
  const category = (industry in fieldPresetsByIndustry ? industry : "other") as FieldCategory;
  return {
    universal: universalFields,
    industry: fieldPresetsByIndustry[category] || otherFields,
  };
}
