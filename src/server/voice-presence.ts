import "server-only";
import { z } from "zod";
import { RoomServiceClient, TrackSource, TwirpError } from "livekit-server-sdk";
import { voiceMemberSchema, voicePresenceSchema, type VoicePresence } from "@/lib/voice-presence";
import { database } from "./db";
import { HttpError } from "./http";

export async function readVoicePresence({
  userId,
  serverId,
}: {
  userId: string;
  serverId: string;
}): Promise<VoicePresence> {
  const db = database();
  const result = await db.query(
    `SELECT u.id,u.name,u.username,u.color FROM "user" u JOIN memberships m ON m.user_id=u.id WHERE m.server_id=$1`,
    [serverId],
  );
  const profiles = z.array(voiceMemberSchema.omit({ microphone: true })).parse(result.rows);
  if (!profiles.some((profile) => profile.id === userId))
    throw new HttpError(403, "You cannot view this community's voice members");
  const roomResult = await db.query(`SELECT id FROM rooms WHERE server_id=$1 AND kind='voice'`, [
    serverId,
  ]);
  const rooms = z.array(z.object({ id: z.string() })).parse(roomResult.rows);
  const channels: VoicePresence["channels"] = {};
  if (rooms.length === 0) return { serverId, channels };

  const { LIVEKIT_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET } = process.env;
  for (const room of rooms) channels[room.id] = { phase: "unavailable" };
  if (!LIVEKIT_URL || !LIVEKIT_API_KEY || !LIVEKIT_API_SECRET) return { serverId, channels };
  const service = new RoomServiceClient(
    LIVEKIT_URL.replace(/^wss:/, "https:").replace(/^ws:/, "http:"),
    LIVEKIT_API_KEY,
    LIVEKIT_API_SECRET,
    { requestTimeout: 10 },
  );
  const names = rooms.map((room) => `relay-${room.id}`);
  let activeNames: Set<string>;
  try {
    activeNames = new Set((await service.listRooms(names)).map((room) => room.name));
  } catch {
    return { serverId, channels };
  }
  const membersById = new Map(profiles.map((profile) => [profile.id, profile]));
  for (let offset = 0; offset < rooms.length; offset += 4) {
    await Promise.all(
      rooms.slice(offset, offset + 4).map(async (room) => {
        const name = `relay-${room.id}`;
        if (!activeNames.has(name)) {
          channels[room.id] = { phase: "ready", members: [] };
          return;
        }
        let participants: Awaited<ReturnType<typeof service.listParticipants>>;
        try {
          participants = await service.listParticipants(name);
        } catch (error) {
          if (error instanceof TwirpError && error.code === "not_found")
            channels[room.id] = { phase: "ready", members: [] };
          return;
        }
        const members = participants.flatMap((participant) => {
          const profile = membersById.get(participant.identity);
          if (!profile) return [];
          return [
            voiceMemberSchema.parse({
              ...profile,
              microphone: participant.tracks.some(
                (track) => track.source === TrackSource.MICROPHONE && !track.muted,
              )
                ? "live"
                : "muted",
            }),
          ];
        });
        members.sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
        channels[room.id] = { phase: "ready", members };
      }),
    );
  }
  return voicePresenceSchema.parse({ serverId, channels });
}
