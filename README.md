# NAKI Bot

Modular Discord moderation, logging, automation, and server-security bot built with TypeScript, discord.js, Prisma, PostgreSQL, Zod, and Vitest.

## Implemented

- Slash-command loader and event loader.
- Persistent per-guild configuration with Prisma.
- Moderation: ban, unban, kick, warn/history, timeout, mute/unmute, clear, lock/unlock, slowmode, announcements.
- Permission pipeline: user permissions, bot permissions, hierarchy, protected owner/bot/security roles, and command-level checks.
- Structured Discord logging for members, messages, channels, roles, moderation, and security.
- Persistent temporary-role scheduler with restart rehydration.
- Welcome and leave messages with safe placeholders and disabled mentions for leave messages.
- AutoMod rules: spam, duplicate messages, mention spam, mass ping, caps, banned words/regex, and link filtering.
- Anti-Raid join-velocity detection with persistent incidents and channel lockdown/unlock.
- Anti-Nuke audit-log detection for mass channel/role/member actions, whitelist support, incident persistence, alerting, and dangerous-role revocation where possible.
- Embed preview/send and per-guild templates.
- Configuration and security status/configuration commands.

## Setup

1. Use Node.js 18 or newer.
2. Copy `.env.example` to `.env` and set `DISCORD_TOKEN`, `CLIENT_ID`, and `DATABASE_URL`.
3. Make sure the bot has the intents listed in `src/index.ts` and the permissions needed by enabled features.
4. Generate Prisma client and apply the schema:

```bash
npm install
npm run db:generate
npm run db:push
```

5. Register slash commands:

```bash
npm run deploy-commands
```

6. Start in development or production:

```bash
npm run dev
npm run build && npm start
```

## Commands

- `/mod ...`
- `/admin temprole|removerole`
- `/log config|test|status`
- `/welcome setup|enable|disable|message|test`
- `/leave setup|enable|disable|message|test`
- `/automod enable|disable|rule-add|rule-remove|rule-list`
- `/security status|lockdown|unlock|config|whitelist-*`
- `/antiraid enable|disable|config|status`
- `/antinuke enable|disable|config|status`
- `/embed preview|send|template-*`
- `/config show|reset`

## Important security notes

- Anti-Nuke relies on the `ViewAuditLog` permission and Discord audit-log timing; no audit-log based detector can guarantee attribution when Discord does not expose a matching entry.
- The server owner and bot are always protected. Whitelisting affects Anti-Nuke attribution, not the owner-protection rule.
- Lockdown edits `@everyone` `SendMessages` overwrites on text/announcement channels. Review existing permission strategy before enabling it on a production server.
- Regex AutoMod rules are bounded to 256 characters and invalid patterns are rejected by the command validator.
- Never commit `.env` or real bot credentials.

## Verification

```bash
npm run build
npm run lint
npm test
```
