import { auth } from "@/server/auth";
import { checkOrigin, failure, readBody, HttpError } from "@/server/http";
import { authSchema, displayNameSchema } from "@/lib/model";
import { usernameAvailable } from "@/server/chat";
import { z } from "zod";

export const dynamic = "force-dynamic";
async function handler(request: Request) {
  if (!process.env.DATABASE_URL)
    return Response.json(
      { error: "Authentication is unavailable in local demo mode" },
      { status: 503 },
    );
  try {
    let forwarded = request;
    if (request.method === "POST") {
      checkOrigin(request);
      let body = await readBody(request);
      const path = new URL(request.url).pathname;
      if (path.endsWith("/sign-up/email") || path.endsWith("/sign-in/email")) {
        const fields = z
          .object({
            email: z.string(),
            password: z.string(),
            name: z.string().optional(),
            username: z.string().optional(),
          })
          .parse(body);
        const input = authSchema.parse({
          ...fields,
          action: path.endsWith("/sign-up/email") ? "register" : "login",
        });
        if (
          input.action === "register" &&
          input.username &&
          !(await usernameAvailable(input.username))
        )
          throw new HttpError(409, "That username is already taken");
        body = {
          email: input.email,
          password: input.password,
          ...(input.action === "register" ? { name: input.name, username: input.username } : {}),
        };
      }
      if (
        !path.endsWith("/sign-up/email") &&
        typeof body === "object" &&
        body !== null &&
        "username" in body
      )
        throw new HttpError(400, "Change your username in Settings");
      if (path.endsWith("/update-user"))
        z.object({ name: displayNameSchema.optional() }).parse(body);
      const headers = new Headers(request.headers);
      headers.delete("content-length");
      forwarded = new Request(request.url, {
        method: request.method,
        headers,
        body: JSON.stringify(body),
      });
    }
    return await auth().handler(forwarded);
  } catch (error) {
    return failure(error);
  }
}
export const GET = handler;
export const POST = handler;
