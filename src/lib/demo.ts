import { z } from "zod";
import {
  type AppState,
  type Command,
  commandSchema,
  usernameChangeAllowedAt,
  usernameSchema,
  userSchema,
  stateSchema,
} from "./model";
import { transitionFriendship } from "./friendships";

const timestamp = (minutes: number) => new Date(Date.now() - minutes * 60000).toISOString();
export function restoreDemo(value: unknown): AppState {
  const legacyUser = userSchema.extend({ username: usernameSchema.optional() });
  const legacy = stateSchema
    .extend({
      me: legacyUser.extend({
        email: z.string().email(),
        usernameChangedAt: z.string().nullable().default(null),
        friendRequestPrivacy: stateSchema.shape.me.shape.friendRequestPrivacy.default("everyone"),
      }),
      users: z.array(legacyUser),
      friends: stateSchema.shape.friends.default([]),
      incoming: stateSchema.shape.incoming.default([]),
      outgoing: stateSchema.shape.outgoing.default([]),
      blocked: stateSchema.shape.blocked.default([]),
    })
    .parse(value);
  const names = new Map<string, string>();
  const used = new Set<string>();
  for (const user of [legacy.me, ...legacy.users]) {
    if (names.has(user.id)) continue;
    const raw =
      user.username ??
      user.name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, ".")
        .replace(/^\.+|\.+$/g, "")
        .slice(0, 20)
        .replace(/\.+$/g, "");
    const base = usernameSchema.safeParse(raw).success ? raw : "member";
    let candidate = base;
    let suffix = 0;
    while (used.has(candidate))
      candidate = `${base.slice(0, 16).replace(/[._]+$/g, "")}${++suffix}`;
    candidate = usernameSchema.parse(candidate);
    names.set(user.id, candidate);
    used.add(candidate);
  }
  return stateSchema.parse({
    ...legacy,
    me: { ...legacy.me, username: names.get(legacy.me.id) },
    users: legacy.users.map((user) => ({ ...user, username: names.get(user.id) })),
  });
}
export function createDemo(): AppState {
  const me = {
    id: "you",
    name: "Alex Morgan",
    username: "alex.morgan",
    usernameChangedAt: null,
    friendRequestPrivacy: "everyone",
    email: "alex@example.com",
    color: "#a78bfa",
    status: "online",
    bio: "Making good things with good people.",
  } satisfies AppState["me"];
  return {
    me,
    friends: [{ id: "friend-mia", userId: "mia", createdAt: timestamp(100) }],
    incoming: [],
    outgoing: [],
    blocked: [],
    users: [
      me,
      {
        id: "mia",
        name: "Mia Chen",
        username: "mia.chen",
        color: "#f4b8a4",
        status: "online",
        bio: "Designing a little bit of everything ✨",
      },
      {
        id: "james",
        name: "James Wilson",
        username: "james.wilson",
        color: "#8db8e9",
        status: "online",
        bio: "Code, coffee, repeat.",
      },
      {
        id: "sarah",
        name: "Sarah Park",
        username: "sarah.park",
        color: "#b8c993",
        status: "idle",
        bio: "Currently looking for inspiration.",
      },
      {
        id: "leo",
        name: "Leo Martinez",
        username: "leo.martinez",
        color: "#d7a3dd",
        status: "dnd",
        bio: "Building the next thing.",
      },
      {
        id: "nora",
        name: "Nora Taylor",
        username: "nora.taylor",
        color: "#f3cb86",
        status: "offline",
        bio: "A little curious about everything.",
      },
    ],
    servers: [
      {
        id: "studio",
        name: "The Creative Studio",
        description:
          "A little space for big ideas. Share your work, find your people, and make something great.",
        icon: "✳",
        color: "#b9f283",
        ownerId: "you",
        inviteCode: "creative-studio",
        memberIds: ["you", "mia", "james", "sarah", "leo", "nora"],
      },
      {
        id: "builders",
        name: "Builders Club",
        description: "Ship it together.",
        icon: "B",
        color: "#aca3ff",
        ownerId: "you",
        inviteCode: "builders-club",
        memberIds: ["you", "james", "leo"],
      },
      {
        id: "gaming",
        name: "After Hours",
        description: "Good games, better company.",
        icon: "☾",
        color: "#f3b58a",
        ownerId: "you",
        inviteCode: "after-hours",
        memberIds: ["you", "sarah", "nora"],
      },
    ],
    rooms: [
      {
        id: "welcome",
        serverId: "studio",
        name: "welcome",
        topic: "Start here. Make yourself at home.",
        kind: "text",
        participantIds: [],
      },
      {
        id: "announcements",
        serverId: "studio",
        name: "announcements",
        topic: "The latest from the studio.",
        kind: "text",
        participantIds: [],
      },
      {
        id: "general",
        serverId: "studio",
        name: "general",
        topic: "A place for a little bit of everything",
        kind: "text",
        participantIds: [],
      },
      {
        id: "design",
        serverId: "studio",
        name: "design-feedback",
        topic: "Fresh eyes, honest feedback.",
        kind: "text",
        participantIds: [],
      },
      {
        id: "inspiration",
        serverId: "studio",
        name: "inspiration",
        topic: "Things that make you look twice.",
        kind: "text",
        participantIds: [],
      },
      {
        id: "random",
        serverId: "studio",
        name: "off-topic",
        topic: "Take a little break.",
        kind: "text",
        participantIds: [],
      },
      {
        id: "lounge",
        serverId: "studio",
        name: "The lounge",
        topic: "Drop in and say hello.",
        kind: "voice",
        participantIds: [],
      },
      {
        id: "focus",
        serverId: "studio",
        name: "Deep work",
        topic: "A quiet place to focus.",
        kind: "voice",
        participantIds: [],
      },
      {
        id: "build-general",
        serverId: "builders",
        name: "general",
        topic: "What are you building?",
        kind: "text",
        participantIds: [],
      },
      {
        id: "game-general",
        serverId: "gaming",
        name: "general",
        topic: "What's everyone playing?",
        kind: "text",
        participantIds: [],
      },
      {
        id: "dm-mia",
        serverId: null,
        name: "Mia Chen",
        topic: "Just between you two",
        kind: "dm",
        participantIds: ["you", "mia"],
      },
    ],
    messages: [
      {
        id: "m1",
        roomId: "general",
        authorId: "mia",
        content:
          "Good morning, studio! ☀️ Hope everyone had a lovely weekend. What are we all working on this week?",
        createdAt: timestamp(42),
        edited: false,
        reactions: [{ emoji: "❤️", userIds: ["james", "sarah", "you"] }],
      },
      {
        id: "m2",
        roomId: "general",
        authorId: "james",
        content:
          "Morning! Finally putting the finishing touches on the new portfolio. That last 10% always takes the longest 😅",
        createdAt: timestamp(39),
        edited: false,
        reactions: [],
      },
      {
        id: "m3",
        roomId: "general",
        authorId: "sarah",
        content:
          "So true. I've been exploring some new color palettes for a brand project. Going for something a little warmer this time.",
        createdAt: timestamp(36),
        edited: false,
        reactions: [],
      },
      {
        id: "m4",
        roomId: "general",
        authorId: "mia",
        content:
          "A small moodboard from this morning. Soft colors, a little texture, and room to breathe. 🌿\n\nWhat do you think of this direction?",
        createdAt: timestamp(31),
        edited: false,
        reactions: [
          { emoji: "🔥", userIds: ["james", "leo", "you"] },
          { emoji: "👀", userIds: ["sarah", "nora"] },
        ],
      },
      {
        id: "m5",
        roomId: "general",
        authorId: "leo",
        content:
          "Love this direction! The sage + peach combination feels really fresh. Would look amazing with a slightly chunky serif.",
        createdAt: timestamp(24),
        edited: false,
        reactions: [{ emoji: "👍", userIds: ["mia"] }],
      },
      {
        id: "m6",
        roomId: "general",
        authorId: "you",
        content: "This is exactly the kind of energy I needed today. Let's make something good ✨",
        createdAt: timestamp(18),
        edited: false,
        reactions: [],
      },
      {
        id: "m7",
        roomId: "welcome",
        authorId: "mia",
        content:
          "Welcome to the studio! Introduce yourself, share what you're creating, and make yourself at home. This is a demo community—your changes stay in this browser.",
        createdAt: timestamp(100),
        edited: false,
        reactions: [],
      },
      {
        id: "m8",
        roomId: "dm-mia",
        authorId: "mia",
        content: "Hey Alex! Would love your eyes on the new direction when you have a minute ✨",
        createdAt: timestamp(12),
        edited: false,
        reactions: [],
      },
    ],
  };
}

export function applyDemoCommand(state: AppState, input: Command): AppState {
  const command = commandSchema.parse(input);
  const next = structuredClone(state);
  const requireRoom = (id: string) => {
    const room = next.rooms.find((r) => r.id === id);
    if (!room) throw new Error("Channel not found");
    if (room.kind === "dm") {
      const peerId = room.participantIds.find((userId) => userId !== next.me.id);
      if (next.blocked.some((person) => person.userId === peerId))
        throw new Error("You cannot contact this person");
      if (
        !next.friends.some((person) => person.userId === peerId) &&
        !next.servers.some(
          (server) =>
            server.memberIds.includes(next.me.id) && peerId && server.memberIds.includes(peerId),
        )
      )
        throw new Error("You must be friends or share a community to send a message");
    }
    return room;
  };
  switch (command.type) {
    case "friendRequest":
    case "friendAccept":
    case "friendDecline":
    case "friendCancel":
    case "friendRemove":
    case "block":
    case "unblock": {
      const peer =
        command.type === "friendRequest"
          ? next.users.find((user) => user.username === command.username)
          : next.users.find((user) => user.id === command.userId);
      if (!peer) throw new Error("No one with that username");
      const existing = [...next.friends, ...next.incoming, ...next.outgoing, ...next.blocked].find(
        (item) => item.userId === peer.id,
      );
      const incoming = next.incoming.some((item) => item.userId === peer.id);
      const current = existing
        ? ({
            requesterId: incoming ? peer.id : next.me.id,
            addresseeId: incoming ? next.me.id : peer.id,
            status: next.blocked.includes(existing)
              ? "blocked"
              : next.friends.includes(existing)
                ? "accepted"
                : "pending",
            blockedBy: next.blocked.includes(existing) ? [next.me.id] : [],
          } satisfies import("./model").Friendship)
        : null;
      const changed = transitionFriendship({
        actorId: next.me.id,
        peerId: peer.id,
        current,
        action: command.type,
      });
      const keys: ("friends" | "incoming" | "outgoing" | "blocked")[] = [
        "friends",
        "incoming",
        "outgoing",
        "blocked",
      ];
      for (const key of keys) next[key] = next[key].filter((item) => item.userId !== peer.id);
      if (changed) {
        const row = existing ?? {
          id: crypto.randomUUID(),
          userId: peer.id,
          createdAt: new Date().toISOString(),
        };
        if (changed.status === "accepted") next.friends.push(row);
        else if (changed.status === "blocked") {
          next.blocked.push(row);
        } else if (changed.requesterId === next.me.id) next.outgoing.push(row);
        else next.incoming.push(row);
      }
      break;
    }
    case "send": {
      if (requireRoom(command.roomId).kind === "voice")
        throw new Error("Use a text channel for messages");
      next.messages.push({
        id: crypto.randomUUID(),
        roomId: command.roomId,
        authorId: next.me.id,
        content: command.content,
        createdAt: new Date().toISOString(),
        edited: false,
        reactions: [],
      });
      break;
    }
    case "edit":
    case "delete":
    case "react": {
      const message = next.messages.find((m) => m.id === command.messageId);
      if (!message) throw new Error("Message not found");
      if (command.type !== "react" && message.authorId !== next.me.id)
        throw new Error("You can only change your own messages");
      if (command.type === "edit") {
        message.content = command.content;
        message.edited = true;
      }
      if (command.type === "delete")
        next.messages = next.messages.filter((m) => m.id !== message.id);
      if (command.type === "react") {
        let reaction = message.reactions.find((r) => r.emoji === command.emoji);
        if (!reaction) {
          reaction = { emoji: command.emoji, userIds: [] };
          message.reactions.push(reaction);
        }
        reaction.userIds = reaction.userIds.includes(next.me.id)
          ? reaction.userIds.filter((id) => id !== next.me.id)
          : [...reaction.userIds, next.me.id];
        message.reactions = message.reactions.filter((r) => r.userIds.length > 0);
      }
      break;
    }
    case "createServer": {
      const id = crypto.randomUUID();
      next.servers.push({
        id,
        name: command.name,
        description: command.description,
        icon: command.name.slice(0, 1).toUpperCase(),
        color: "#b9f283",
        ownerId: next.me.id,
        inviteCode: crypto.randomUUID(),
        memberIds: [next.me.id],
      });
      next.rooms.push({
        id: crypto.randomUUID(),
        serverId: id,
        name: "general",
        topic: "Your community starts here.",
        kind: "text",
        participantIds: [],
      });
      break;
    }
    case "createRoom": {
      if (!next.servers.some((s) => s.id === command.serverId && s.ownerId === next.me.id))
        throw new Error("Only the server owner can create channels");
      next.rooms.push({
        id: crypto.randomUUID(),
        serverId: command.serverId,
        name: command.name,
        topic: "A new place to connect.",
        kind: command.kind,
        participantIds: [],
      });
      break;
    }
    case "join": {
      if (!next.servers.some((s) => s.inviteCode === command.inviteCode))
        throw new Error(
          "Demo invites only work for communities in this browser. Connect Neon to invite other people.",
        );
      break;
    }
    case "dm": {
      const user = next.users.find((u) => u.id === command.userId && u.id !== next.me.id);
      if (!user) throw new Error("Choose another member");
      if (next.blocked.some((person) => person.userId === user.id))
        throw new Error("You cannot contact this person");
      if (
        !next.friends.some((person) => person.userId === user.id) &&
        !next.servers.some(
          (server) => server.memberIds.includes(next.me.id) && server.memberIds.includes(user.id),
        )
      )
        throw new Error("You must be friends or share a community to start a conversation");
      if (!next.rooms.some((r) => r.kind === "dm" && r.participantIds.includes(user.id)))
        next.rooms.push({
          id: crypto.randomUUID(),
          serverId: null,
          name: user.name,
          topic: "Just between you two",
          kind: "dm",
          participantIds: [next.me.id, user.id],
        });
      break;
    }
    case "profile": {
      if (command.username && command.username !== next.me.username) {
        const allowedAt = usernameChangeAllowedAt(next.me.usernameChangedAt);
        if (allowedAt && Date.now() < new Date(allowedAt).getTime())
          throw new Error("You can change your username once every 14 days");
        if (next.users.some((u) => u.id !== next.me.id && u.username === command.username))
          throw new Error("That username is already taken");
        next.me.username = command.username;
        next.me.usernameChangedAt = new Date().toISOString();
      }
      next.me = { ...next.me, name: command.name, bio: command.bio, status: command.status };
      if (command.friendRequestPrivacy) next.me.friendRequestPrivacy = command.friendRequestPrivacy;
      next.users = next.users.map((u) => (u.id === next.me.id ? next.me : u));
      break;
    }
    default: {
      const exhaustive: never = command;
      return exhaustive;
    }
  }
  return next;
}
