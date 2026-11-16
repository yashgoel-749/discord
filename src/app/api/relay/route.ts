import { commandSchema } from "@/lib/model";
import { execute, snapshot } from "@/server/chat";
import { actor, checkOrigin, failure, readBody } from "@/server/http";

export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try {
    return Response.json(await snapshot(await actor(request)), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return failure(error);
  }
}
export async function POST(request: Request) {
  try {
    checkOrigin(request);
    const userId = await actor(request);
    await execute(userId, commandSchema.parse(await readBody(request)));
    return Response.json(await snapshot(userId), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return failure(error);
  }
}
