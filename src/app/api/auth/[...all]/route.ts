import { auth } from "@/server/auth";
import { checkOrigin, failure, readBody } from "@/server/http";
import { authSchema, displayNameSchema } from "@/lib/model";
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
      const body = await readBody(request);
      const path = new URL(request.url).pathname;
      if (path.endsWith("/sign-up/email") || path.endsWith("/sign-in/email")) {
        const fields = z
          .object({ email: z.string(), password: z.string(), name: z.string().optional() })
          .parse(body);
        authSchema.parse({
          ...fields,
          action: path.endsWith("/sign-up/email") ? "register" : "login",
        });
      }
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
