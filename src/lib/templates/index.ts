import { dentalTemplate } from './dental';
import { legalTemplate } from './legal';
import { homeServicesTemplate } from './home-services';
import { medicalTemplate } from './medical';
import { realEstateTemplate } from './real-estate';
import { otherTemplate } from './other';
import { salonTemplate } from './salon';
import { automotiveTemplate } from './automotive';
import { veterinaryTemplate } from './veterinary';
import { restaurantTemplate } from './restaurant';

export interface AssistantTemplate {
  industry: string;
  name: string;
  description: string;
  systemPrompt: string;
  firstMessage: string;
  sampleFAQs: Array<{ question: string; answer: string }>;
  voiceId: string;
  recommendedSettings: {
    maxCallDuration: number;
    silenceTimeout: number;
    interruptionThreshold: number;
  };
}

export const templates: Record<string, AssistantTemplate> = {
  dental: dentalTemplate,
  legal: legalTemplate,
  home_services: homeServicesTemplate,
  medical: medicalTemplate,
  real_estate: realEstateTemplate,
  salon: salonTemplate,
  automotive: automotiveTemplate,
  veterinary: veterinaryTemplate,
  restaurant: restaurantTemplate,
  other: otherTemplate,
};

export const getTemplateByIndustry = (industry: string): AssistantTemplate => {
  return templates[industry] || templates.other;
};

export const getAllTemplates = (): AssistantTemplate[] => {
  return Object.values(templates);
};

export const getIndustryTemplates = (): AssistantTemplate[] => {
  return Object.values(templates);
};

export const industryOptions = [
  { value: 'dental', label: 'Dental Practice', description: 'Dentists, orthodontists, oral surgeons' },
  { value: 'legal', label: 'Law Firm', description: 'Attorneys, legal services' },
  { value: 'home_services', label: 'Home Services', description: 'Plumbers, electricians, HVAC, contractors' },
  { value: 'medical', label: 'Medical Practice', description: 'Doctors, clinics, healthcare providers' },
  { value: 'real_estate', label: 'Real Estate', description: 'Agents, brokers, property management' },
  { value: 'salon', label: 'Salon / Spa / Beauty', description: 'Hair salons, spas, nail salons, barbershops' },
  { value: 'automotive', label: 'Automotive / Mechanic', description: 'Auto repair, mechanics, body shops' },
  { value: 'veterinary', label: 'Veterinary / Pet Care', description: 'Vet clinics, animal hospitals, pet care' },
  { value: 'restaurant', label: 'Restaurant / Hospitality', description: 'Restaurants, cafes, catering, hotels' },
  { value: 'other', label: 'Other Business', description: 'General business receptionist' },
];

export const populateTemplate = (
  template: AssistantTemplate,
  variables: { business_name?: string; knowledge_base?: string }
): { systemPrompt: string; firstMessage: string } => {
  let systemPrompt = template.systemPrompt;
  let firstMessage = template.firstMessage;

  if (variables.business_name) {
    systemPrompt = systemPrompt.replace(/{business_name}/g, variables.business_name);
    firstMessage = firstMessage.replace(/{business_name}/g, variables.business_name);
  }

  if (variables.knowledge_base) {
    systemPrompt = systemPrompt.replace(/{knowledge_base}/g, variables.knowledge_base);
  } else {
    systemPrompt = systemPrompt.replace(/{knowledge_base}/g, 'No additional business information provided yet.');
  }

  return { systemPrompt, firstMessage };
};

export {
  dentalTemplate,
  legalTemplate,
  homeServicesTemplate,
  medicalTemplate,
  realEstateTemplate,
  otherTemplate,
  salonTemplate,
  automotiveTemplate,
  veterinaryTemplate,
  restaurantTemplate,
};
