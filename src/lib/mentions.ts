import { usernameSchema, type User } from "./model";

type MentionPart = { kind: "text"; text: string } | { kind: "mention"; user: User };
export function mentionParts(content: string, users: User[]): MentionPart[] {
  const parts: MentionPart[] = [];
  const byUsername = new Map(users.map((user) => [user.username, user]));
  let cursor = 0;
  for (const match of content.matchAll(/(?<![a-z0-9_.@])@([a-z0-9][a-z0-9_.]*)/gi)) {
    const token = match[1].replace(/\.+$/, "");
    const parsed = usernameSchema.safeParse(token);
    const user = parsed.success ? byUsername.get(parsed.data) : undefined;
    if (!user) continue;
    if (match.index > cursor)
      parts.push({ kind: "text", text: content.slice(cursor, match.index) });
    parts.push({ kind: "mention", user });
    cursor = match.index + token.length + 1;
  }
  if (cursor < content.length) parts.push({ kind: "text", text: content.slice(cursor) });
  return parts;
}
