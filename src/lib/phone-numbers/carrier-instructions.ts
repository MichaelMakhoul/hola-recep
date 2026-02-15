export interface CarrierInfo {
  id: string;
  name: string;
  instructions: {
    conditional: {
      enable: string;
      disable: string;
      note: string;
    };
    unconditional: {
      enable: string;
      disable: string;
      note: string;
    };
  };
}

export const CARRIERS: CarrierInfo[] = [
  {
    id: "att",
    name: "AT&T",
    instructions: {
      conditional: {
        enable: "*67*{destination_number}#",
        disable: "#67#",
        note: "Forwards calls when your line is busy or you don't answer.",
      },
      unconditional: {
        enable: "*21*{destination_number}#",
        disable: "#21#",
        note: "Forwards all calls immediately. Your phone will not ring.",
      },
    },
  },
  {
    id: "verizon",
    name: "Verizon",
    instructions: {
      conditional: {
        enable: "*71{destination_number}",
        disable: "*73",
        note: "Forwards calls when your line is busy or you don't answer.",
      },
      unconditional: {
        enable: "*72{destination_number}",
        disable: "*73",
        note: "Forwards all calls immediately. Your phone will not ring.",
      },
    },
  },
  {
    id: "tmobile",
    name: "T-Mobile",
    instructions: {
      conditional: {
        enable: "**62*{destination_number}#",
        disable: "##62#",
        note: "Forwards calls when your phone is unreachable or you don't answer.",
      },
      unconditional: {
        enable: "**21*{destination_number}#",
        disable: "##21#",
        note: "Forwards all calls immediately. Your phone will not ring.",
      },
    },
  },
  {
    id: "uscellular",
    name: "US Cellular",
    instructions: {
      conditional: {
        enable: "*71{destination_number}",
        disable: "*73",
        note: "Forwards calls when your line is busy or you don't answer.",
      },
      unconditional: {
        enable: "*72{destination_number}",
        disable: "*73",
        note: "Forwards all calls immediately. Your phone will not ring.",
      },
    },
  },
  {
    id: "other",
    name: "Other / Landline",
    instructions: {
      conditional: {
        enable: "*71{destination_number}",
        disable: "*73",
        note: "These are the most common codes. Contact your carrier if they don't work.",
      },
      unconditional: {
        enable: "*72{destination_number}",
        disable: "*73",
        note: "These are the most common codes. Contact your carrier if they don't work.",
      },
    },
  },
];

export function getCarrierById(id: string, countryCode?: string): CarrierInfo | undefined {
  if (countryCode) {
    const { getCarriersForCountry } = require("@/lib/country-config");
    const carriers = getCarriersForCountry(countryCode);
    return carriers.find((c: CarrierInfo) => c.id === id);
  }
  return CARRIERS.find((c) => c.id === id);
}

export function formatInstructions(template: string, destinationNumber: string): string {
  return template.replace(/\{destination_number\}/g, destinationNumber);
}
