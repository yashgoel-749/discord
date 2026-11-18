import { usernameSchema } from "@/lib/model";
import { usernameAvailable } from "@/server/chat";
import { actor, failure } from "@/server/http";

export async function GET(request: Request) {
  try {
    const userId = await actor(request);
    const username = usernameSchema.parse(new URL(request.url).searchParams.get("username"));
    return Response.json(
      { username, available: await usernameAvailable(username, userId) },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return failure(error);
  }
}
