import { z } from "zod";

export const presenceHeartbeatMs = 20000;
export const presenceLeaseSeconds = 120;
export const presenceCommandSchema = z.object({
  type: z.enum(["open", "heartbeat", "close"]),
  tabId: z.uuid(),
});
export type PresenceCommand = z.infer<typeof presenceCommandSchema>;
