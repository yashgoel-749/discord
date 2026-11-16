import "server-only";
import { z } from "zod";
import { auth } from "./auth";

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export async function actor(request: Request) {
  if (!process.env.DATABASE_URL)
    throw new HttpError(503, "Shared chat is not configured. Use the local demo.");
  const session = await auth().api.getSession({ headers: request.headers });
  if (!session) throw new HttpError(401, "Please sign in to continue");
  return session.user.id;
}

export function checkOrigin(request: Request) {
  const expected = process.env.APP_URL;
  if (!expected || request.headers.get("origin") !== new URL(expected).origin)
    throw new HttpError(403, "Request origin is not allowed");
}

export async function readBody(request: Request): Promise<unknown> {
  if (!request.headers.get("content-type")?.includes("application/json"))
    throw new HttpError(415, "Send JSON content");
  const reader = request.body?.getReader();
  if (!reader) throw new HttpError(400, "Request body is required");
  const chunks: Uint8Array[] = [];
  let length = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    length += value.byteLength;
    if (length > 20000) {
      await reader.cancel();
      throw new HttpError(413, "Request is too large");
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  try {
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw new HttpError(400, "Invalid JSON");
  }
}

export function failure(error: unknown) {
  if (error instanceof HttpError)
    return Response.json({ error: error.message }, { status: error.status });
  if (error instanceof z.ZodError)
    return Response.json({ error: error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  console.error("relay.request_failed", {
    error: error instanceof Error ? error.message : "unknown",
  });
  return Response.json({ error: "Something went wrong. Please try again." }, { status: 500 });
}
