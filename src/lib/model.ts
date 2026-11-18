import { z } from "zod";

export const displayNameSchema = z.string().trim().min(2).max(48);
export const usernameSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(3, "Use at least 3 characters")
  .max(20, "Use no more than 20 characters")
  .regex(/^[a-z0-9_.]+$/, "Use only letters, numbers, underscores, and dots")
  .regex(/^[a-z0-9].*[a-z0-9]$/, "Start and end with a letter or number")
  .refine((value) => !value.includes(".."), "Two consecutive dots are not allowed")
  .refine(
    (value) => !["admin", "relay", "support", "system", "everyone", "here"].includes(value),
    "That username is reserved",
  );
export const usernameChangeAllowedAt = (changedAt: string | null) =>
  changedAt ? new Date(new Date(changedAt).getTime() + 14 * 86400000).toISOString() : null;
export const usernameAvailabilitySchema = z.object({
  username: usernameSchema,
  available: z.boolean(),
});
export const userSchema = z.object({
  id: z.string(),
  name: displayNameSchema,
  username: usernameSchema,
  color: z.string(),
  status: z.enum(["online", "idle", "dnd", "offline"]),
  bio: z.string(),
});
export const friendPrivacySchema = z.enum(["everyone", "communities", "no_one"]);
export const relationshipSchema = z.object({
  id: z.string(),
  userId: z.string(),
  createdAt: z.string(),
});
export const friendshipSchema = z.object({
  requesterId: z.string(),
  addresseeId: z.string(),
  status: z.enum(["pending", "accepted", "blocked"]),
  blockedBy: z.array(z.string()),
});
export type Friendship = z.infer<typeof friendshipSchema>;
export const serverSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  icon: z.string(),
  color: z.string(),
  ownerId: z.string(),
  inviteCode: z.string(),
  memberIds: z.array(z.string()),
});
export const roomSchema = z.object({
  id: z.string(),
  serverId: z.string().nullable(),
  name: z.string(),
  topic: z.string(),
  kind: z.enum(["text", "voice", "dm"]),
  participantIds: z.array(z.string()),
});
export const messageSchema = z.object({
  id: z.string(),
  roomId: z.string(),
  authorId: z.string(),
  content: z.string(),
  createdAt: z.string(),
  edited: z.boolean(),
  reactions: z.array(z.object({ emoji: z.string(), userIds: z.array(z.string()) })),
});
export const stateSchema = z.object({
  me: userSchema.extend({
    email: z.string().email(),
    usernameChangedAt: z.string().nullable(),
    friendRequestPrivacy: friendPrivacySchema,
  }),
  users: z.array(userSchema),
  servers: z.array(serverSchema),
  rooms: z.array(roomSchema),
  messages: z.array(messageSchema),
  friends: z.array(relationshipSchema),
  incoming: z.array(relationshipSchema),
  outgoing: z.array(relationshipSchema),
  blocked: z.array(relationshipSchema),
});
export type User = z.infer<typeof userSchema>;
export type Server = z.infer<typeof serverSchema>;
export type Room = z.infer<typeof roomSchema>;
export type Message = z.infer<typeof messageSchema>;
export type AppState = z.infer<typeof stateSchema>;

const name = displayNameSchema;
export const commandSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("friendRequest"),
    username: z
      .string()
      .trim()
      .transform((value) => (value.startsWith("@") ? value.slice(1) : value))
      .pipe(usernameSchema),
  }),
  z.object({
    type: z.enum([
      "friendAccept",
      "friendDecline",
      "friendCancel",
      "friendRemove",
      "block",
      "unblock",
    ]),
    userId: z.string().min(1),
  }),
  z.object({
    type: z.literal("send"),
    roomId: z.string().min(1),
    content: z.string().trim().min(1).max(4000),
  }),
  z.object({
    type: z.literal("edit"),
    messageId: z.string().min(1),
    content: z.string().trim().min(1).max(4000),
  }),
  z.object({ type: z.literal("delete"), messageId: z.string().min(1) }),
  z.object({
    type: z.literal("react"),
    messageId: z.string().min(1),
    emoji: z.enum(["❤️", "🔥", "👍", "🎉", "👀", "🚀"]),
  }),
  z.object({ type: z.literal("createServer"), name, description: z.string().trim().max(200) }),
  z.object({
    type: z.literal("createRoom"),
    serverId: z.string().min(1),
    name: z
      .string()
      .trim()
      .min(1)
      .max(48)
      .regex(/^[a-z0-9-]+$/, "Use lowercase letters, numbers, and hyphens"),
    kind: z.enum(["text", "voice"]),
  }),
  z.object({ type: z.literal("join"), inviteCode: z.string().trim().min(1).max(100) }),
  z.object({ type: z.literal("dm"), userId: z.string().min(1) }),
  z.object({
    type: z.literal("profile"),
    name,
    username: usernameSchema.optional(),
    friendRequestPrivacy: friendPrivacySchema.optional(),
    bio: z.string().trim().max(200),
    status: userSchema.shape.status,
  }),
]);
export type Command = z.infer<typeof commandSchema>;

export const authSchema = z
  .object({
    action: z.enum(["login", "register"]),
    email: z
      .string()
      .trim()
      .email()
      .max(254)
      .transform((v) => v.toLowerCase()),
    password: z.string().min(10).max(128),
    name: name.optional(),
    username: usernameSchema.optional(),
  })
  .superRefine((v, ctx) => {
    if (v.action === "register" && !v.name)
      ctx.addIssue({ code: "custom", message: "Display name is required", path: ["name"] });
    if (v.action === "register" && !v.username)
      ctx.addIssue({ code: "custom", message: "Username is required", path: ["username"] });
  });
