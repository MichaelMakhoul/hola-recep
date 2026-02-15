/**
 * Ensures the 3 calendar tools exist as standalone resources in Vapi.
 * On first call: lists existing tools, matches by function name, creates any missing.
 * Caches IDs in memory — tools are account-wide, same for all assistants.
 */

import { getVapiClient } from "./client";
import { calendarTools } from "@/lib/calendar/cal-com";

let cachedToolIds: string[] | null = null;

export async function ensureCalendarTools(): Promise<string[]> {
  if (cachedToolIds) return cachedToolIds;

  const vapi = getVapiClient();
  const existing = await vapi.listTools();

  const toolDefs = [
    calendarTools.checkAvailability,
    calendarTools.bookAppointment,
    calendarTools.cancelAppointment,
  ];

  const ids: string[] = [];
  for (const def of toolDefs) {
    const found = existing.find((t) => t.function?.name === def.function.name);
    if (found) {
      ids.push(found.id);
    } else {
      const created = await vapi.createTool(def);
      ids.push(created.id);
    }
  }

  cachedToolIds = ids;
  return ids;
}
