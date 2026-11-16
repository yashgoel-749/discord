import { AccessToken } from "livekit-server-sdk";
import { z } from "zod";
import { actor, checkOrigin, failure, HttpError, readBody } from "@/server/http";
import { voiceAdmission } from "@/server/chat";

export async function POST(request: Request) {
  try {
    checkOrigin(request);
    const userId = await actor(request);
    const { roomId } = z.object({ roomId: z.string().min(1) }).parse(await readBody(request));
    await voiceAdmission(userId, roomId);
    const { LIVEKIT_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET } = process.env;
    if (!LIVEKIT_URL || !LIVEKIT_API_KEY || !LIVEKIT_API_SECRET)
      throw new HttpError(503, "Voice needs LiveKit credentials. Text chat is ready to use.");
    const token = new AccessToken(LIVEKIT_API_KEY, LIVEKIT_API_SECRET, {
      identity: userId,
      ttl: "10m",
    });
    token.addGrant({
      roomJoin: true,
      room: `relay-${roomId}`,
      canPublish: true,
      canSubscribe: true,
      canPublishData: true,
    });
    return Response.json(
      { token: await token.toJwt(), url: LIVEKIT_URL },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return failure(error);
  }
}
