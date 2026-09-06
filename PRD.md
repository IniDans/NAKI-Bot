# PRD.md

# Discord Bot - Moderation, Security & Server Management

## 1. Problem Statement

Server Discord membutuhkan sistem otomatis yang mampu membantu administrator dalam melakukan moderasi, pencatatan aktivitas, keamanan server, serta pengelolaan member tanpa harus melakukan semuanya secara manual.

Masalah utama yang ingin diselesaikan:

1. Administrator kesulitan memantau aktivitas penting seperti message deletion, message edit, member join/leave, role changes, ban, kick, timeout, dan perubahan konfigurasi server.
2. Server membutuhkan sistem logging yang terstruktur dan mudah dibaca.
3. Administrator membutuhkan cara cepat untuk membuat Discord Embed tanpa harus menulis JSON atau melakukan konfigurasi manual.
4. Server membutuhkan sistem welcome dan leave message yang dapat dikustomisasi.
5. Server membutuhkan AutoMod untuk mendeteksi spam, flood, mention abuse, banned words, excessive caps, links, dan aktivitas mencurigakan lainnya.
6. Server publik rentan terhadap raid, mass join, mass mention, bot spam, webhook abuse, dan aktivitas yang dapat menyebabkan kerusakan server.
7. Administrator membutuhkan sistem proteksi terhadap tindakan destructive seperti mass ban, mass kick, mass role deletion, mass channel deletion, dan perubahan permission yang mencurigakan.
8. Administrator membutuhkan command moderasi seperti ban, kick, mute, timeout, warn, temporary role, dan tindakan lainnya.
9. Konfigurasi bot harus tersimpan secara persistent sehingga restart bot tidak menghapus konfigurasi server.
10. Bot harus dirancang modular agar fitur baru dapat ditambahkan tanpa harus mengubah keseluruhan sistem.

---

# 2. Goals

## Primary Goals

Membangun Discord bot modular yang berfungsi sebagai:

- Moderation Bot
- Logging System
- AutoMod System
- Anti-Raid System
- Anti-Nuke System
- Server Security System
- Welcome & Leave System
- Embed Builder
- Administration Utility

## Secondary Goals

Bot harus:

- Mudah dikonfigurasi oleh administrator.
- Mendukung multi-server/guild.
- Memiliki permission system yang aman.
- Menggunakan Discord Slash Commands.
- Menyediakan konfigurasi per guild.
- Memiliki error handling yang baik.
- Memiliki audit trail untuk tindakan administratif.
- Meminimalkan false positive pada sistem keamanan.
- Tidak melakukan tindakan destructive tanpa validasi.
- Memiliki struktur kode modular dan scalable.

## Success Criteria

Project dianggap berhasil apabila:

1. Bot dapat berjalan stabil pada production environment.
2. Semua konfigurasi tersimpan secara persistent.
3. Setiap guild memiliki konfigurasi independen.
4. Administrator dapat mengaktifkan/nonaktifkan fitur tanpa restart bot.
5. Semua aktivitas moderation dan security dapat dilacak melalui logs.
6. Sistem anti-raid dan anti-nuke mampu mendeteksi pola aktivitas abnormal.
7. Bot memiliki permission validation sebelum menjalankan administrative action.
8. Bot tidak dapat melakukan tindakan melebihi permission yang dimiliki bot.
9. Semua command memiliki response yang jelas dan user-friendly.
10. Sistem dapat dikembangkan dengan fitur tambahan tanpa refactor besar.

---

# 3. Target User

## Primary Users

### Server Owner

Membutuhkan kontrol penuh terhadap:

- Security
- Moderation
- Logging
- Server configuration
- Anti-raid
- Anti-nuke

### Administrator

Membutuhkan:

- Moderation commands
- Logs
- AutoMod configuration
- Security configuration
- Member management

### Moderator

Membutuhkan:

- Warn
- Mute
- Timeout
- Kick
- Ban
- Temporary role
- Moderation history

### Community Manager

Membutuhkan:

- Welcome message
- Leave message
- Embed builder
- Automated announcements
- Member activity monitoring

## Secondary Users

### Regular Members

Member mendapatkan pengalaman server yang lebih aman dan terorganisir tanpa perlu mengetahui sistem internal bot.

---

# 4. User Stories

## Logging

- Sebagai administrator, saya ingin melihat siapa yang melakukan ban terhadap member agar tindakan moderator dapat diaudit.
- Sebagai administrator, saya ingin melihat member join dan leave agar aktivitas server dapat dipantau.
- Sebagai administrator, saya ingin melihat message deletion agar aktivitas mencurigakan dapat diketahui.
- Sebagai administrator, saya ingin melihat message edit agar perubahan pesan dapat dilacak.
- Sebagai administrator, saya ingin melihat perubahan role agar privilege escalation dapat dideteksi.
- Sebagai administrator, saya ingin melihat perubahan channel agar tindakan destructive dapat diketahui.
- Sebagai administrator, saya ingin melihat webhook creation/deletion agar webhook abuse dapat dideteksi.

## Embed Builder

- Sebagai administrator, saya ingin membuat embed melalui command agar tidak perlu membuat JSON secara manual.
- Sebagai administrator, saya ingin mengatur title, description, color, footer, thumbnail, image, author, timestamp, dan fields.
- Sebagai administrator, saya ingin melakukan preview embed sebelum mengirimkannya.
- Sebagai administrator, saya ingin menyimpan template embed untuk digunakan kembali.

## Welcome & Leave

- Sebagai administrator, saya ingin mengatur welcome message.
- Sebagai administrator, saya ingin mengatur leave message.
- Sebagai administrator, saya ingin menggunakan placeholder seperti username, mention, server name, member count, dan user ID.
- Sebagai administrator, saya ingin menentukan channel tujuan welcome dan leave message.
- Sebagai administrator, saya ingin mengaktifkan atau menonaktifkan fitur tersebut.

## AutoMod

- Sebagai administrator, saya ingin memblokir kata tertentu.
- Sebagai administrator, saya ingin mendeteksi spam.
- Sebagai administrator, saya ingin membatasi jumlah message dalam interval tertentu.
- Sebagai administrator, saya ingin mendeteksi excessive mentions.
- Sebagai administrator, saya ingin mendeteksi excessive caps.
- Sebagai administrator, saya ingin membatasi link atau domain tertentu.
- Sebagai administrator, saya ingin menentukan action ketika rule dilanggar.

## Anti-Raid

- Sebagai administrator, saya ingin bot mendeteksi lonjakan member join.
- Sebagai administrator, saya ingin menentukan threshold raid.
- Sebagai administrator, saya ingin mengaktifkan lockdown otomatis.
- Sebagai administrator, saya ingin bot mendeteksi akun yang melakukan join secara massal.
- Sebagai administrator, saya ingin mendapatkan alert ketika raid terdeteksi.
- Sebagai administrator, saya ingin bot melakukan tindakan mitigasi secara otomatis.

## Anti-Nuke

- Sebagai server owner, saya ingin melindungi channel dari mass deletion.
- Sebagai server owner, saya ingin melindungi role dari mass deletion.
- Sebagai server owner, saya ingin melindungi permission dari perubahan mencurigakan.
- Sebagai server owner, saya ingin membatasi mass ban/kick.
- Sebagai server owner, saya ingin bot mendeteksi administrator yang melakukan tindakan destructive secara abnormal.
- Sebagai server owner, saya ingin bot dapat melakukan recovery terhadap konfigurasi tertentu.

## Administration

- Sebagai moderator, saya ingin melakukan ban terhadap member.
- Sebagai moderator, saya ingin melakukan kick.
- Sebagai moderator, saya ingin memberikan warning.
- Sebagai moderator, saya ingin melakukan timeout.
- Sebagai moderator, saya ingin memberikan temporary role.
- Sebagai moderator, saya ingin menghapus temporary role secara otomatis ketika waktunya habis.
- Sebagai moderator, saya ingin melihat moderation history member.

---

# 5. Functional Requirements

## 5.1 Architecture

Bot harus menggunakan architecture modular.

Recommended structure:

```text
src/
├── commands/
│   ├── admin/
│   ├── moderation/
│   ├── security/
│   ├── automod/
│   ├── utility/
│   ├── embed/
│   └── configuration/
│
├── events/
│   ├── guild/
│   ├── messages/
│   ├── moderation/
│   ├── security/
│   └── channels/
│
├── modules/
│   ├── logger/
│   ├── automod/
│   ├── antiraid/
│   ├── antinuke/
│   ├── welcome/
│   ├── leave/
│   ├── moderation/
│   └── embed/
│
├── services/
│   ├── database/
│   ├── permissions/
│   ├── security/
│   ├── scheduler/
│   └── audit/
│
├── utils/
├── config/
└── index.js
```

Bot harus menggunakan clean separation antara:

- Commands
- Events
- Business Logic
- Database
- Security
- Configuration

---

## 5.2 Logging System

Logging harus mendukung minimal:

### Member Logs

- Member Join
- Member Leave
- Member Ban
- Member Unban
- Member Kick
- Member Timeout
- Member Warn
- Member Role Add
- Member Role Remove
- Nickname Change

### Message Logs

- Message Delete
- Bulk Message Delete
- Message Edit
- Attachment information
- Link information

### Channel Logs

- Channel Create
- Channel Delete
- Channel Update
- Permission Update

### Role Logs

- Role Create
- Role Delete
- Role Update
- Permission changes

### Server Logs

- Server settings update
- Webhook Create
- Webhook Delete
- Webhook Update
- Emoji Create/Delete/Update
- Sticker Create/Delete/Update

### Security Logs

- Anti-Raid trigger
- Anti-Nuke trigger
- Suspicious administrator action
- Mass moderation action
- Lockdown activation
- Security violation

### Log Configuration

Administrator dapat menentukan channel untuk setiap kategori log.

Contoh:

```text
/log config member #member-logs
/log config moderation #mod-logs
/log config security #security-logs
/log config message #message-logs
```

Log embed harus memiliki:

- Event type
- User
- Target
- Action
- Reason
- Timestamp
- Guild
- Relevant IDs
- Before/After values jika tersedia

---

## 5.3 Embed Builder

Command:

```text
/embed create
/embed edit
/embed preview
/embed send
/embed template save
/embed template load
/embed template delete
```

Embed builder harus mendukung:

- Title
- Description
- Color
- Author
- Author icon
- Thumbnail
- Image
- Footer
- Footer icon
- Timestamp
- Fields
- Inline fields
- URL
- Mention control

Contoh workflow:

```text
/embed create
```

Bot kemudian menyediakan konfigurasi menggunakan Discord modal/components.

User harus dapat melakukan preview sebelum embed dikirim.

Template embed harus tersimpan per guild.

---

## 5.4 Welcome System

Command:

```text
/welcome setup
/welcome enable
/welcome disable
/welcome test
/welcome message
```

Configuration:

```text
channel
enabled
message
embed
image
color
```

Supported placeholders:

```text
{user}
{username}
{displayname}
{mention}
{server}
{membercount}
{userid}
```

Contoh:

```text
Welcome {mention} to {server}!
You are member #{membercount}.
```

Bot harus menyediakan `/welcome test` untuk melakukan preview tanpa harus menunggu member baru masuk.

---

## 5.5 Leave System

Command:

```text
/leave setup
/leave enable
/leave disable
/leave test
/leave message
```

Supported placeholders:

```text
{username}
{displayname}
{server}
{membercount}
{userid}
```

Leave message tidak boleh mengungkap informasi sensitif mengenai user.

---

## 5.6 AutoMod

AutoMod harus memiliki rule engine.

Supported rules:

### Spam Detection

Configuration:

```text
max_messages
time_window
action
```

Example:

```text
5 messages / 3 seconds
```

### Duplicate Message Detection

Mendeteksi message identik atau hampir identik yang dikirim berulang.

### Mention Spam

Configuration:

```text
max_mentions
action
```

### Mass Ping

Mendeteksi:

```text
@everyone
@here
large user mention count
```

### Excessive Caps

Configuration:

```text
minimum_message_length
caps_percentage
action
```

### Banned Words

Administrator dapat membuat custom word list.

Support:

```text
exact match
contains
regex
```

Regex harus divalidasi dan dibatasi untuk mencegah resource exhaustion.

### Link Filter

Administrator dapat:

- Block all external links
- Allow specific domains
- Block specific domains
- Detect invite links

### AutoMod Actions

Supported actions:

```text
delete
warn
timeout
mute
kick
ban
add role
log
```

Action harus configurable per rule.

---

## 5.7 Anti-Raid System

Anti-Raid harus menggunakan behavioral detection, bukan hanya satu threshold sederhana.

Detection signals:

- Rapid member joins
- Account age
- Join velocity
- Similar usernames
- Similar avatars jika memungkinkan
- Repeated invite usage
- Mass message activity
- Mass mention activity
- Suspicious bot joins

Configuration:

```text
raid_join_threshold
raid_time_window
minimum_account_age
verification_level
lockdown_duration
```

Example:

```text
10 joins within 10 seconds
```

Trigger:

```text
RAID DETECTED
```

Bot dapat melakukan:

1. Alert security channel.
2. Enable lockdown.
3. Restrict new members.
4. Prevent suspicious message activity.
5. Timeout suspicious accounts.
6. Kick suspicious accounts.
7. Store incident information.

Bot harus menyediakan manual override:

```text
/security lockdown
/security unlock
```

---

## 5.8 Anti-Nuke System

Anti-Nuke merupakan salah satu fitur security paling penting.

Bot harus memonitor tindakan destructive melalui Discord Audit Logs.

Protected actions:

### Channel

- Mass channel delete
- Mass channel create
- Mass channel permission modification

### Role

- Mass role delete
- Mass role create
- Mass role permission modification

### Member

- Mass ban
- Mass kick
- Mass timeout

### Server

- Dangerous permission changes
- Webhook abuse
- Integration changes
- Server configuration changes

Configuration example:

```text
channel_delete_threshold = 3
role_delete_threshold = 3
ban_threshold = 5
kick_threshold = 5
action_window = 10 seconds
```

Jika threshold terlampaui:

1. Identify executor.
2. Validate executor against whitelist.
3. Log incident.
4. Revoke dangerous roles if possible.
5. Stop further destructive actions.
6. Lock affected systems.
7. Alert server owner.
8. Store security incident.

Whitelist:

```text
/server security whitelist add @User
/server security whitelist remove @User
/server security whitelist list
```

Owner account harus selalu memiliki status protected.

Bot tidak boleh mencoba mengambil tindakan terhadap server owner.

---

## 5.9 Administration & Moderation

Required commands:

```text
/ban
/unban
/kick
/warn
/warnings
/clear
/timeout
/untimeout
/mute
/unmute
/temprole
/removerole
/lock
/unlock
/slowmode
/announce
```

### Ban

```text
/ban user reason delete_days
```

Requirements:

- Permission validation
- Hierarchy validation
- Reason logging
- DM notification if possible
- Audit log entry

### Kick

```text
/kick user reason
```

### Warn

```text
/warn user reason
```

Warning system:

```text
warning ID
user ID
moderator ID
reason
timestamp
```

### Timeout

```text
/timeout user duration reason
```

Support:

```text
10s
5m
1h
1d
7d
```

Maximum duration must respect Discord API limitations.

### Temporary Role

```text
/temprole user role duration reason
```

Example:

```text
/temprole @user @VIP 7d
```

Bot must schedule role removal automatically.

If bot restarts, temporary role schedules must be restored from the database.

---

## 5.10 Permission System

Every administrative command must perform:

1. User permission check.
2. Bot permission check.
3. Role hierarchy check.
4. Target validation.
5. Protected user validation.
6. Action validation.

Example:

```text
Moderator role
        ↓
Permission Check
        ↓
Role Hierarchy Check
        ↓
Target Validation
        ↓
Execute Action
        ↓
Log Action
```

Protected users:

- Server Owner
- Bot
- Configured security administrators
- Configured protected roles

---

## 5.11 Configuration System

Each guild must have independent configuration.

Configuration categories:

```text
guild
logging
welcome
leave
automod
antiraid
antinuke
moderation
security
embed_templates
```

Configuration must be editable without restarting the bot.

Example:

```text
/config show
/config reset
```

Sensitive configuration must not be exposed publicly.

---

## 5.12 Database

The system must use persistent database storage.

Recommended options:

- PostgreSQL for production
- SQLite for local development/testing

Minimum entities:

```text
Guild
GuildConfig
LogConfig
AutoModRule
SecurityConfig
SecurityWhitelist
Warning
ModerationCase
TemporaryRole
EmbedTemplate
RaidIncident
SecurityIncident
```

Every record should have:

```text
id
guild_id
created_at
updated_at
```

Where appropriate, include:

```text
user_id
moderator_id
target_id
reason
metadata
```

---

## 5.13 Scheduler

The bot must have persistent scheduled task handling.

Required use cases:

- Temporary roles
- Temporary bans if implemented
- Scheduled unmute
- Scheduled unlock
- Security cooldown
- Raid lockdown expiration

Scheduler must survive bot restart.

Do not rely exclusively on `setTimeout()` for persistent tasks.

---

## 5.14 Error Handling

Bot must gracefully handle:

- Missing permissions
- Discord API errors
- Rate limits
- Invalid user
- Invalid role
- Invalid channel
- Deleted configuration channel
- Deleted role
- Database failure
- Unexpected exceptions

Errors should be logged internally without exposing sensitive stack traces to Discord users.

---

## 5.15 Rate Limit & Abuse Protection

The bot itself must implement internal rate limiting for commands.

Example:

```text
/admin commands
5 requests / 10 seconds / user
```

Security-sensitive actions should have stricter limits.

The bot must respect Discord API rate limits.

Do not implement aggressive retry loops.

---

# 6. Non-Functional Requirements

## Performance

- Commands should normally respond within 2 seconds.
- Security detection should operate near real-time.
- Logging should not block critical moderation actions.
- Database queries should be indexed appropriately.

## Reliability

- Bot must recover gracefully after restart.
- Persistent configuration must not be lost.
- Scheduled tasks must be restored after restart.
- Database errors must not crash the entire bot.

## Security

- Never hardcode bot tokens.
- Use environment variables.
- Never expose tokens in logs.
- Validate all user input.
- Sanitize embed content.
- Validate regex rules.
- Protect against command abuse.
- Protect against privilege escalation.
- Follow Discord permission hierarchy.

## Scalability

The architecture must support:

```text
1 guild
10 guilds
100 guilds
1,000+ guilds
```

without requiring major architectural changes.

## Maintainability

Code must:

- Follow consistent naming conventions.
- Use modular files.
- Avoid duplicated business logic.
- Use reusable services.
- Include comments only where logic is non-obvious.
- Use environment configuration.
- Provide clear README documentation.

## Observability

The bot should provide:

- Structured application logs.
- Security incident logs.
- Error logs.
- Command execution logs.
- Database error logs.

---

# 7. Scope

## In Scope

### Core

- Discord bot
- Slash commands
- Persistent database
- Multi-guild configuration
- Permission system

### Moderation

- Ban
- Unban
- Kick
- Warn
- Warning history
- Timeout
- Mute
- Unmute
- Clear
- Temporary role
- Lock
- Unlock
- Slowmode

### Logging

- Member logs
- Message logs
- Moderation logs
- Channel logs
- Role logs
- Server logs
- Security logs
- Audit logs

### Automation

- Welcome
- Leave
- AutoMod
- Temporary role scheduler

### Security

- Anti-Raid
- Anti-Nuke
- Lockdown
- Security whitelist
- Suspicious activity detection

### Utility

- Embed Builder
- Embed Templates
- Announcements
- Configuration commands

## Out of Scope

- Music system
- Economy system
- Gambling
- Leveling system
- AI chatbot
- Ticket system
- Giveaway system
- Moderation dashboard/web panel
- Mobile application
- External social media integrations
- Payment system
- Cryptocurrency
- Voice recording

---

# 8. Command Structure

```text
/admin
    /admin temprole
    /admin removerole

/mod
    /mod ban
    /mod unban
    /mod kick
    /mod warn
    /mod warnings
    /mod timeout
    /mod mute
    /mod unmute
    /mod clear

/log
    /log config
    /log test
    /log status

/welcome
    /welcome setup
    /welcome enable
    /welcome disable
    /welcome test

/leave
    /leave setup
    /leave enable
    /leave disable
    /leave test

/automod
    /automod enable
    /automod disable
    /automod rule add
    /automod rule remove
    /automod rule list

/security
    /security status
    /security lockdown
    /security unlock
    /security whitelist
    /security config

/antinuke
    /antinuke enable
    /antinuke disable
    /antinuke config
    /antinuke whitelist

/antiraid
    /antiraid enable
    /antiraid disable
    /antiraid config

/embed
    /embed create
    /embed preview
    /embed send
    /embed template

/config
    /config show
    /config reset
```

---

# 9. Security Principles

Security features must follow the principle:

```text
Detect → Validate → Mitigate → Log → Notify → Recover
```

Never immediately perform destructive actions based solely on a single event.

Example:

```text
Channel Deleted
        ↓
Check Audit Log
        ↓
Identify Executor
        ↓
Check Whitelist
        ↓
Count Recent Actions
        ↓
Compare Threshold
        ↓
Determine Threat Level
        ↓
Mitigate
        ↓
Log Incident
        ↓
Notify Owner
```

Security actions should use configurable thresholds.

Recommended threat levels:

```text
LOW
MEDIUM
HIGH
CRITICAL
```

---

# 10. Development Requirements

Use a production-ready stack.

Recommended:

```text
Node.js
TypeScript
discord.js
PostgreSQL
Prisma ORM
dotenv
Zod
```

Use TypeScript instead of plain JavaScript for the production implementation.

The project must include:

```text
package.json
tsconfig.json
.env.example
README.md
PRD.md
prisma/
src/
```

Never include real secrets inside the repository.

`.env.example` should contain:

```env
DISCORD_TOKEN=
CLIENT_ID=
DATABASE_URL=
```

---

# 11. Development Rules for AI Coding Agent

The implementation agent MUST:

1. Read this PRD completely before writing code.
2. Do not implement features outside the defined scope.
3. Do not create fake functionality that only returns success messages.
4. Every command must perform the actual Discord API operation.
5. Every security event must be logged.
6. Every administrative action must validate permissions.
7. Never trust user-provided IDs without validation.
8. Never hardcode secrets.
9. Use database persistence for all configuration.
10. Make scheduled actions persistent.
11. Handle Discord API rate limits correctly.
12. Handle Discord permission hierarchy correctly.
13. Avoid blocking the event loop.
14. Avoid duplicated business logic.
15. Keep modules independently testable.
16. Add validation for all configuration inputs.
17. Add meaningful error handling.
18. Do not silently swallow exceptions.
19. Do not use destructive fallback behavior.
20. Do not claim a feature is complete unless it has been implemented and tested.

---

# 12. Testing Requirements

The project must include tests for:

## Moderation

- Ban
- Kick
- Warn
- Timeout
- Temporary role
- Permission failures
- Role hierarchy failures

## AutoMod

- Spam detection
- Mention spam
- Banned words
- Link filtering
- Caps detection
- Duplicate messages

## Anti-Raid

- Normal join behavior
- Rapid join detection
- False positive scenarios
- Lockdown
- Lockdown expiration

## Anti-Nuke

- Normal administrator behavior
- Mass channel deletion
- Mass role deletion
- Mass ban
- Whitelisted administrator
- Non-whitelisted administrator
- False positive scenarios

## Database

- Guild creation
- Configuration update
- Configuration retrieval
- Temporary task persistence
- Recovery after restart

---

# 13. Definition of Done

A feature is considered complete only when:

- Implementation exists.
- Command/event is registered.
- Database schema is implemented if required.
- Permission validation exists.
- Error handling exists.
- Logging exists.
- Configuration exists if required.
- Tests exist.
- Documentation exists.
- Bot can run without runtime errors.
- Feature works after bot restart where persistence is required.

---

# 14. Future Roadmap

## V2

- Web dashboard
- Advanced analytics
- Moderation dashboard
- Custom server branding
- Advanced AutoMod
- AI-assisted moderation
- Security incident dashboard

## V3

- Cross-server threat intelligence
- Advanced behavioral analysis
- Machine-learning based raid detection
- Automated security reports
- Web-based embed builder
- Multi-bot cluster architecture

---

# 15. Final Implementation Objective

Build a production-ready, modular Discord bot focused on:

```text
MODERATION
    +
LOGGING
    +
AUTOMATION
    +
SECURITY
    +
SERVER MANAGEMENT
```

The bot must prioritize:

```text
Security
Reliability
Permission Safety
Persistence
Performance
Maintainability
```

The final implementation should behave like a serious Discord infrastructure bot rather than a collection of unrelated commands.

Do not prioritize feature quantity over reliability.

A smaller feature set that works correctly is preferable to a large feature set containing fake implementations, insecure permission handling, or unstable automation.
