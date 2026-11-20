# Relay architecture

## Problem

An empty workspace needs an independently branded community chat application that works before credentials are available, without confusing a demo with a shared service.

## Usage

`npm run dev` opens a browser-local demo. With DATABASE_URL, BETTER_AUTH_SECRET, and APP_URL configured, the same UI requires real authentication and uses Neon. Missing production secrets fail closed rather than reverting to demo.

```ts
const state = await load();
await dispatch({ type: "send", roomId, content });
await dispatch({ type: "react", messageId, emoji: "❤️" });
```

## Shape and ownership

- `src/lib/model.ts`: Zod domain and command contracts; inferred TypeScript types.
- `src/lib/demo.ts`: seed and pure local command reducer.
- `src/lib/friendships.ts`: shared friendship state transitions.
- `src/lib/request-order.ts`: request ordering for stale-read rejection.
- `src/components/use-relay.ts`: one browser snapshot owner, serialized mutations, local persistence, connected polling.
- `src/components/relay-app.tsx`: presentation, selection, dialogs, drafts; never a second transcript owner.
- `src/server/auth.ts`: Better Auth sessions/credentials in Neon.
- `src/server/chat.ts`: authorized snapshot and command execution, parameterized SQL.
- `src/app/api`: HTTP boundary validation, origin checks, authenticated identity.
- `src/components/voice-room.tsx`: LiveKit media lifecycle; server grants scoped voice admission.

Reads and writes are scoped to the current user's communities, conversations, and relationships. Identity comes from the session, secrets stay server-side, and text is never rendered as HTML. DMs require friendship or shared-community membership, with neither person blocking the other. Only owners create channels. SQL predicates enforce conversation access.

`db/002_usernames_friends.sql` backfills public usernames, enforces case-insensitive uniqueness, and stores request privacy and unordered friendship pairs. Each pair records both users' independent blocks. Friendship changes, DM creation, and DM sending use transactions with ordered user-row locks. Hourly friend-request counts share `command_limits` with the existing command limiter.

Signup validates usernames through the shared Zod schema. Better Auth rejects direct username updates. Relay settings enforces availability and the 14-day change limit. Snapshots expose public handles but keep emails, request privacy, and relationship lists viewer-scoped.

PGlite socket checks use one application connection and a test-only correction for the extra ReadyForQuery emitted after failed Execute messages in PGlite 0.4.6. A protocol regression test covers that correction. Production uses PostgreSQL's normal protocol and defaults to five pool connections.

## Synthesis decision

Two independent design-only candidates compared integrated Next.js and Vite + Node/WebSockets. Scores (1–5) for keyless use, security, ownership, deployment, extensibility: integrated 5/5/5/5/4; split 5/5/5/3/5. Integrated is the base: simpler deployment and no extra realtime provider. Borrow explicit transport mode and single client-state ownership from split. Reject simulated voice, bespoke sockets, and generic repository layers. No cross-family judge ran; no explicit alternate model was selected.

## Accepted tradeoffs

- Polling instead of WebSockets for simple deployment; updates are not instantaneous.
- Snapshot limited to the newest 300 accessible messages; pagination remains future work.
- Browser-local persistence rather than IndexedDB for this bounded demo.
- Better Auth handles password/session machinery; email verification and recovery delivery remain required before public launch.
- Initial roles are owner/member; granular permissions and moderation are future stages.

## Automatic availability

`useRelay` calls `useTabPresence(userId, refresh)` for authenticated connected users. The hook sends an open request, heartbeats every 20 seconds, and a best-effort close beacon on `pagehide`. Each document uses a random tab ID. A restored page creates a new ID. Presence acknowledgments do not contain snapshots, so they cannot overwrite chat state or enter the command queue.

`POST /api/presence` validates the shared Zod contract and authenticates both user and session. `recordPresence(actor, command)` owns per-tab records in `db/003_presence.sql`. It uses server timestamps, a 120-second lease, and the user-row lock already used by profile changes. The first live tab sets saved availability to online; additional tabs and heartbeats preserve manual choices. Closed records remain terminal until their session is deleted. Delayed open or heartbeat requests cannot resurrect a closed document. Session deletion cascades its records, and expired sessions never count as live.

`snapshot` keeps `me.status` as the saved setting for profile forms. Public `users[].status` is that setting when any live tab exists, otherwise offline. Existing community, conversation, and friendship access predicates still determine who can see each user. Presence has separate rate-limit counters and does not consume chat commands.

Two design-only candidates compared server-side tab leases with auth-session heartbeats coordinated through browser storage. Both rejected browser leadership because it cannot reliably identify the final tab across suspension, crashes, and multiple devices. Tab leases are the base. The synthesis keeps the existing settings schema instead of adding a duplicate manual-status field. No cross-family judge ran; candidates used the current model. The user approved automatic presence and the additive production migration.

Clean closes appear offline on the next observer poll. Missed close signals expire after the lease deadline. Hidden tabs keep heartbeating, but a browser can suspend them; instantaneous crash detection is not guaranteed. Presence never changes authentication, chat permissions, friendship state, or voice admission.

## Reconciliation

Implementation expands initial scope to DMs, invites, reactions, editing, profiles, optional LiveKit video/screen sharing, and automatic presence. User authorized autonomous feature choices. Domain commands remain the chat mutation interface; the authenticated presence endpoint owns only tab lifecycle and the first-open availability reset. Demo is explicitly a local simulation; seeded status is not connected presence.

## Risks / remaining decisions

Which GitHub repository and deployment account should host this? Supply Neon and optional LiveKit credentials through environment settings, never source control. Public launch needs verification/recovery email, moderation, abuse controls, backups, and larger-scale integration tests.
