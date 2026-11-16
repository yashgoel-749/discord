import { z } from "zod";
import { userSchema } from "./model";

export const voiceMemberSchema = userSchema
  .pick({ id: true, name: true, color: true })
  .extend({ microphone: z.enum(["live", "muted"]) })
  .strict();
export const voiceChannelPresenceSchema = z.discriminatedUnion("phase", [
  z.object({ phase: z.literal("ready"), members: z.array(voiceMemberSchema) }).strict(),
  z.object({ phase: z.literal("unavailable") }).strict(),
]);
export const voicePresenceSchema = z
  .object({
    serverId: z.string().min(1),
    channels: z.record(z.string(), voiceChannelPresenceSchema),
  })
  .strict();
export type VoicePresence = z.infer<typeof voicePresenceSchema>;
export type VoiceChannelPresence = z.infer<typeof voiceChannelPresenceSchema>;
export type VoiceChannelView = VoiceChannelPresence | { phase: "loading" } | { phase: "disabled" };
