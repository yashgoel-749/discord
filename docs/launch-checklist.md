# Prepare Relay for public registration

This first release is suitable for local evaluation and a controlled pilot. Complete these steps before public registration.

1. Configure verification and password-recovery email through Better Auth and an email provider. Require verified email for public accounts.
2. Add terms of service, a privacy policy, account deletion, and data-retention rules.
3. Add community moderation, member removal, granular roles, and invite revocation. Disconnect removed members from active LiveKit calls.
4. Add gateway-level request and connection limits. Review shared limits against traffic and verify proxy IP handling.
5. Set Neon backups and recovery procedures. Test restoring the database.
6. Add pagination and bounded resource quotas for communities, channels, and message history.
7. Test two browsers against the deployed Neon database and real LiveKit project. Verify media permissions and reconnection on the target networks.
8. Add monitoring, error reporting, and alerts without logging passwords, session cookies, or message content.
9. Review dependency updates and apply a deployment-appropriate content security policy.
10. Run a security review and load tests before expanding access.

Do not advertise full Discord parity, end-to-end encryption, instant realtime, or production readiness for this release. Presence uses heartbeats and polling; crash detection can take two minutes plus refresh latency.
