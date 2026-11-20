import { presenceCommandSchema } from "@/lib/presence";
import { actorSession, checkOrigin, failure, readBody } from "@/server/http";
import { recordPresence } from "@/server/presence";

export async function POST(request: Request) {
  try {
    checkOrigin(request);
    const actor = await actorSession(request);
    await recordPresence(actor, presenceCommandSchema.parse(await readBody(request)));
    return new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return failure(error);
  }
}
