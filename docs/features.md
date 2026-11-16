# Feature reference

## Available

- Independent Relay branding and responsive dark layout.
- Community creation with an owner and members.
- Text and voice channel creation by the owner.
- Community invitation links.
- Shared email/password accounts when Neon is configured.
- Text messages, editing, deletion, and six reaction types.
- One-to-one direct messages between people who share a community.
- Profile name, bio, and user-selected availability.
- Current-channel search within loaded messages.
- Browser-session message bookmarks and channel mute preferences.
- Optional LiveKit voice, camera video, and screen sharing.
- Voice stays connected during channel, community, and DM navigation, with a persistent call bar.
- Live voice-channel member lists with names, avatars, counts, and microphone state.
- Browser-local demo persistence and reset.

## Limits

Shared chat returns the newest 300 messages across accessible conversations. Older messages remain in the database but are not paginated in this release. Updates use three-second polling, not WebSockets.

Availability is user-selected. It is not a live connection indicator. Demo participants and their availability are sample data.

Bookmarks and mute preferences last for the browser session. Mute does not control push notifications because push delivery is not implemented.

Invites have no expiration or rotation UI. Treat them as access links. The current roles are owner and member. Ownership cannot be transferred in this release.

Profile emails are returned only to the account owner. Direct messages are visible only to their participants.

Voice admission tokens expire after ten minutes. Connected calls do not automatically end when a token expires. Membership removal and active-call revocation are not implemented.

One voice call is active per tab. Browsing another voice channel does not join it. Explicitly switching calls, disconnecting, signing out, reloading, or closing the tab ends the current call.

Voice member lists are visible to community members even outside a call. Lists refresh about every three seconds plus service latency and show microphone state, not who is speaking. They use LiveKit's current room membership, not profile availability. Failed presence reads show an unavailable message rather than stale members or a false empty room.

## Not included

File uploads, GIF search, threads, durable replies, pins, group DMs, custom emojis, configurable roles, kicks, bans, member removal, server deletion, invite revocation, typing indicators, unread counts, push notifications, email verification, password-recovery delivery, audit logs, bots, end-to-end encryption, and native desktop or mobile clients are not included.

The reply action inserts an @name into your draft. It does not create a threaded reply or send a mention notification.
