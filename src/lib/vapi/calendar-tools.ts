/**
 * Ensures all calendar tools exist as standalone resources in Vapi.
 * On first call: lists all account tools, matches calendar tools by function name,
 * and creates any that are missing. Caches IDs in memory for the lifetime of the
 * process — tools are account-wide, same for all assistants.
 *
 * Note: only verifies tools exist by function name — does not detect external
 * modifications to tool definitions. If tools are deleted or modified externally,
 * a server restart is required.
 */

import { getVapiClient, buildVapiServerConfig } from "./client";
import { calendarTools } from "@/lib/calendar/cal-com";

let pendingInit: Promise<string[]> | null = null;
let cachedToolIds: string[] | null = null;

export async function ensureCalendarTools(): Promise<string[]> {
  if (cachedToolIds) return cachedToolIds;

  // Promise-based lock prevents concurrent requests from creating duplicate tools
  if (!pendingInit) {
    pendingInit = resolveCalendarTools().finally(() => {
      pendingInit = null;
    });
  }

  return pendingInit;
}

async function resolveCalendarTools(): Promise<string[]> {
  const vapi = getVapiClient();
  const serverConfig = buildVapiServerConfig();

  let existing;
  try {
    existing = await vapi.listTools();
  } catch (error) {
    console.error("Failed to list existing Vapi tools:", error);
    throw new Error(
      `Calendar tool setup failed: unable to list tools from Vapi. ${error instanceof Error ? error.message : String(error)}`
    );
  }

  if (!Array.isArray(existing)) {
    console.error("Unexpected response from Vapi listTools:", typeof existing, existing);
    throw new Error("Calendar tool setup failed: unexpected response format from Vapi tools API");
  }

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
      try {
        const created = await vapi.createTool({
          ...def,
          ...(serverConfig && { server: serverConfig }),
        });
        if (!created?.id) {
          throw new Error(`Vapi createTool returned no ID for tool "${def.function.name}"`);
        }
        ids.push(created.id);
      } catch (error) {
        console.error(`Failed to create Vapi tool "${def.function.name}":`, error);
        throw new Error(
          `Calendar tool setup failed: unable to create tool "${def.function.name}". ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }
  }

  cachedToolIds = ids;
  return ids;
}
