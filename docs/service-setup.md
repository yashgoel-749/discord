# Connect Relay to your services

Keep secrets in `.env.local` for local use and in your hosting provider's environment settings for deployment. Never paste passwords or API secrets into chat, issues, or commits.

## Rotate the Neon password

If a connection string has been shared, reset its password before using it.

1. Open [the Neon console](https://console.neon.tech) and select your project.
2. Select the branch used by your app.
3. Under **Postgres database**, open **Roles**.
4. Open the menu for `neondb_owner` and select **Reset password**.
5. Confirm the reset. Repeat this for any other branch where the credential was exposed.
6. Select **Connect** and copy the new connection string.
7. Open `.env.local` and set `DATABASE_URL` to that string. Keep its SSL query parameters.

Resetting the password changes credentials, not your database tables. Replace the connection string anywhere else that uses the old password.

See [Neon's password-reset instructions](https://neon.com/docs/manage/roles#reset-a-password).

## Set the local origin and create the schema

The setup command creates `.env.local` with a random `BETTER_AUTH_SECRET` and never overwrites an existing file.

```sh
npm run env:setup
```

For the current preview on port 3001, set `APP_URL=http://localhost:3001`. For the default development server, use `APP_URL=http://localhost:3000`.

After adding the rotated `DATABASE_URL`, run:

```sh
npm run db:migrate
```

Restart the server to load the environment. For port 3001, use:

```sh
npm run dev -- --port 3001
```

Create an account, create a community, and test its invite from a second account. LiveKit is not required for text chat.

## Get the LiveKit credentials

1. Sign in to [LiveKit Cloud](https://cloud.livekit.io).
2. Create a project for Relay.
3. Open **Project settings** and copy the project WebSocket URL, which starts with `wss://`.
4. Open the project's **API keys** section and create a key if necessary.
5. Copy the key and secret directly into `.env.local`.

Set these variables:

```dotenv
LIVEKIT_URL=wss://your-project.livekit.cloud
LIVEKIT_API_KEY=your-project-api-key
LIVEKIT_API_SECRET=your-project-api-secret
```

Restart Relay, create a voice channel, and select **Join conversation**. Test with two accounts and allow microphone access when your browser asks. Use HTTPS for deployed voice and screen sharing.

No Discord bot token, OpenAI key, or Google API key is required for these features.

## Put the app online

1. Sign in to [Vercel](https://vercel.com) with GitHub.
2. Select **Add New**, then **Project**, and import `yashgoel-749/discord`.
3. Add the rotated `DATABASE_URL` and a randomly generated `BETTER_AUTH_SECRET` in the project's environment settings.
4. Add the LiveKit variables if you want calls.
5. Set `APP_URL` to your app's public HTTPS origin, without a trailing slash.
6. Apply the database schema before accepting users.
7. Deploy. If the assigned domain differs from `APP_URL`, update the variable and redeploy.

Do not share Vercel or GitHub account passwords. Dashboard setup does not require an API token in chat.

Complete [the public-launch checklist](launch-checklist.md) before opening registration beyond a controlled pilot.
