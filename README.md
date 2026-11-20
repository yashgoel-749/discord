# Relay

A Discord-inspired community app with independent branding. Start with the browser-local demo, then connect Neon for shared accounts and chat.

## Run the app

Use Node.js 22.22 or newer. The local demo also passed its build on Node.js 20.20.1, but a voice dependency requires Node.js 22.22.

```sh
npm install
npm run dev
```

Open [localhost:3000](http://localhost:3000). No keys are required for the demo. Its example members are not real users, and changes stay in your browser.

Try these actions:

- Send a message and reload the page.
- Create a community with the **+** button in the left rail.
- Create a channel, then send a message there.
- Hover over your message to edit, delete, react, or save it.
- Open a member's profile and select **Message** to start a direct message.
- Open **Your people** to manage friends, requests, and blocked people.
- Change your public username and friend-request privacy in **Settings**.
- Search the current conversation with **Ctrl+K** or **Cmd+K**.

See [the feature reference](docs/features.md) for limits and unsupported features.

## Connect shared chat

1. Create a [Neon Postgres project](https://neon.tech).
2. Run `npm run env:setup` to create `.env.local` with a random authentication secret. Existing files remain unchanged.
3. Set `DATABASE_URL` to your Neon connection string, including its SSL settings.
4. Set `APP_URL` to `http://localhost:3000` for local use.
5. Apply the schema.

```sh
npm run db:migrate
```

6. Restart the app. Create an account, create a community, and share its invite with a second account.

Neon is the durable database. Better Auth stores accounts and sessions in the same database. Shared messages refresh every three seconds while the tab is visible.

Opening Relay starts your availability as Online if no other tab or device is connected. You can choose Away, Do not disturb, or Invisible in Settings. Opening another tab preserves that choice. Closing the last tab shows you offline, usually within the next three-second refresh. If a browser crashes or cannot send its close signal, presence expires after two minutes plus refresh latency. Suspended tabs can also expire; a heartbeat restores their selected availability when they resume. Demo statuses remain simulated.

Do not commit `.env.local` or paste credentials into chat. Set production secrets in your deployment provider's environment settings.

## Connect voice, video, and screen sharing

1. Create a [LiveKit Cloud project](https://cloud.livekit.io).
2. Set `LIVEKIT_URL`, `LIVEKIT_API_KEY`, and `LIVEKIT_API_SECRET` in `.env.local`.
3. Restart the app and create a voice channel.
4. Open the voice channel and select **Join conversation**.

Use HTTPS on a deployed app. Browsers require a secure context for microphone, camera, and screen access. These features do not connect in demo mode.

Calls stay connected while you browse text channels, direct messages, and other communities. Use the call bar to mute, return to the call, or disconnect. Browsing another voice channel does not switch your call until you select **Switch voice channel**. Reloading, closing the tab, or signing out ends the call.

Each voice channel lists its connected members, avatars, and microphone state. Community members can see the list without joining a call. Lists refresh about every three seconds plus service latency.

## Verify changes

```sh
npm run typecheck
npm test
npm run build
npx playwright install chromium
npm run test:e2e
npm run test:integration
npm run format:check
```

The connected integration check requires the production build and Chromium. It starts an in-memory PostgreSQL-compatible database and a separate Next.js server. It checks authentication, chat, usernames, friendships, privacy, and browser interactions, including delayed polling. It needs no Neon credentials. It does not prove Neon deployment behavior or LiveKit media connectivity.

With valid LiveKit credentials in `.env.local`, run `npm run test:voice` after the production build. This check uses two Chromium sessions with synthetic microphones, a third observer, and a temporary database. It verifies audio reception, call persistence, named member lists, spectator access, membership privacy, mute, channel switching, disconnect, and sign-out. It removes its temporary LiveKit rooms and does not change Neon data.

## Deploy

1. Use the [Relay repository](https://github.com/yashgoel-749/discord).
2. Import the repository into Vercel, or deploy it to a Node.js host.
3. Set `DATABASE_URL`, `BETTER_AUTH_SECRET`, and `APP_URL` for the deployed origin.
4. Run `npm run db:migrate` against the target database before the first release.
5. Add the LiveKit variables if you want voice.
6. Build with `npm run build` and start with `npm start` on a Node.js host.

Use a separate Neon branch for previews. Set each preview's `APP_URL` to its own origin.

When upgrading an existing deployment, coordinate `db/002_usernames_friends.sql` with this release. The migration backfills public usernames and makes `username` required. The previous signup code cannot create users after that migration. Pause registration during the migration and deployment, then reopen it after verifying the new signup flow.

Apply `db/003_presence.sql` before deploying automatic presence. This additive migration creates per-tab presence records and separate presence rate-limit counters. It preserves existing users, messages, and saved availability.

Read [the launch checklist](docs/launch-checklist.md) before opening registration to the public. This is a working first release, not full Discord feature parity.
