import { z } from "zod";

export const displayNameSchema = z.string().trim().min(2).max(48);
export const userSchema = z.object({
  id: z.string(),
  name: displayNameSchema,
  color: z.string(),
  status: z.enum(["online", "idle", "dnd", "offline"]),
  bio: z.string(),
});
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
  me: userSchema.extend({ email: z.string().email() }),
  users: z.array(userSchema),
  servers: z.array(serverSchema),
  rooms: z.array(roomSchema),
  messages: z.array(messageSchema),
});
export type User = z.infer<typeof userSchema>;
export type Server = z.infer<typeof serverSchema>;
export type Room = z.infer<typeof roomSchema>;
export type Message = z.infer<typeof messageSchema>;
export type AppState = z.infer<typeof stateSchema>;

const name = displayNameSchema;
export const commandSchema = z.discriminatedUnion("type", [
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
  })
  .superRefine((v, ctx) => {
    if (v.action === "register" && !v.name)
      ctx.addIssue({ code: "custom", message: "Display name is required", path: ["name"] });
  });
