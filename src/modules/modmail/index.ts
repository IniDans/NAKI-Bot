import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  Client,
  EmbedBuilder,
  Guild,
  Message,
  StringSelectMenuBuilder,
  TextChannel,
  ThreadAutoArchiveDuration,
  ThreadChannel,
  User,
} from 'discord.js';
import { db } from '../../services/database/index.js';
import { modConfigService } from '../../services/database/modconfig.service.js';
import { Colors } from '../../config/constants.js';
import { TtlCache } from '../../utils/ttlCache.js';
import { appLogger } from '../../utils/logger.js';

const prisma = db.client;

/** Staff messages starting with this stay inside the thread as internal notes. */
export const INTERNAL_PREFIX = '//';

type Draft = { content: string; files: string[] };

// threadId -> userId for open modmail threads ('' = not a modmail thread). Checked on every thread message.
const threadOwners = new TtlCache<string>(60_000, 10_000);
// The DM that started the conversation, kept until the user picks a server.
const drafts = new TtlCache<Draft>(10 * 60_000, 2_000);

function draftOf(message: Message): Draft {
  return { content: message.content.slice(0, 4000), files: message.attachments.map((a) => a.url).slice(0, 10) };
}

function relayEmbed(author: User, draft: Draft, color: number, footer: string): EmbedBuilder {
  const files = draft.files.length ? `\n\n${draft.files.map((url, i) => `[Attachment ${i + 1}](${url})`).join('\n')}` : '';
  return new EmbedBuilder()
    .setColor(color)
    .setAuthor({ name: author.tag, iconURL: author.displayAvatarURL() })
    .setDescription(`${draft.content || '*No text*'}${files}`.slice(0, 4096))
    .setFooter({ text: footer })
    .setTimestamp();
}

async function threadOwner(threadId: string): Promise<string | null> {
  const owner = await threadOwners.getOrLoad(threadId, async () => {
    const row = await prisma.modmailThread.findUnique({ where: { threadId } });
    return row?.open ? row.userId : '';
  });
  return owner || null;
}

async function openThreadFor(client: Client, userId: string): Promise<ThreadChannel | null> {
  const row = await prisma.modmailThread.findFirst({ where: { userId, open: true } });
  if (!row) return null;
  const thread = await client.channels.fetch(row.threadId).catch(() => null);
  if (thread?.isThread() && !thread.locked) return thread;
  // Thread was deleted or locked by hand: treat the conversation as closed.
  await prisma.modmailThread.update({ where: { id: row.id }, data: { open: false, closedAt: new Date() } });
  threadOwners.set(row.threadId, '');
  return null;
}

/** Guilds the user shares with the bot that accept modmail. */
async function eligibleGuilds(client: Client, userId: string): Promise<Guild[]> {
  const configs = await prisma.modConfig.findMany({
    where: { modmailEnabled: true, modmailChannelId: { not: null } },
    select: { guildId: true },
  });
  const guilds: Guild[] = [];
  for (const { guildId } of configs) {
    const guild = client.guilds.cache.get(guildId);
    if (guild && (await guild.members.fetch(userId).catch(() => null))) guilds.push(guild);
  }
  return guilds.slice(0, 25);
}

export const modmailModule = {
  async handleDM(message: Message): Promise<void> {
    const thread = await openThreadFor(message.client, message.author.id);
    if (thread) {
      await thread.send({
        embeds: [relayEmbed(message.author, draftOf(message), Colors.INFO, 'From user')],
        allowedMentions: { parse: [] },
      });
      await message.react('✅').catch(() => undefined);
      return;
    }

    const guilds = await eligibleGuilds(message.client, message.author.id);
    if (guilds.length === 0) {
      await message.reply('None of the servers we share accept messages to staff through me.').catch(() => undefined);
      return;
    }
    drafts.set(message.author.id, draftOf(message));

    if (guilds.length === 1) {
      const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder().setCustomId(`modmail:open:${guilds[0].id}`).setLabel('Send to staff').setStyle(ButtonStyle.Primary),
      );
      await message.reply({
        content: `Send this message to the staff of **${guilds[0].name}**? Everything you write here afterwards goes to them until they close the conversation.`,
        components: [row],
      });
      return;
    }

    const menu = new StringSelectMenuBuilder()
      .setCustomId('modmail:pick')
      .setPlaceholder('Choose a server')
      .addOptions(guilds.map((g) => ({ label: g.name.slice(0, 100), value: g.id })));
    await message.reply({
      content: 'Which server do you want to contact? Your message goes to its staff.',
      components: [new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu)],
    });
  },

  /** Creates the staff thread and forwards the saved first message. Returns an error for the user, or null. */
  async open(client: Client, user: User, guildId: string): Promise<string | null> {
    if (await openThreadFor(client, user.id)) return 'You already have an open conversation. Just keep writing here.';
    const guild = client.guilds.cache.get(guildId);
    const config = await modConfigService.get(guildId);
    const channel = config?.modmailEnabled && config.modmailChannelId ? guild?.channels.cache.get(config.modmailChannelId) : null;
    if (!guild || !(channel instanceof TextChannel)) return 'That server no longer accepts messages to staff.';
    const member = await guild.members.fetch(user.id).catch(() => null);
    if (!member) return 'You are not a member of that server.';

    const thread = await channel.threads.create({
      name: `${user.username}`.slice(0, 90),
      autoArchiveDuration: ThreadAutoArchiveDuration.OneWeek,
      reason: `Modmail from ${user.tag}`,
    });
    await prisma.modmailThread.create({ data: { guildId, userId: user.id, threadId: thread.id } });
    threadOwners.set(thread.id, user.id);

    const previous = await prisma.modmailThread.count({ where: { guildId, userId: user.id, open: false } });
    const header = new EmbedBuilder()
      .setColor(Colors.INFO)
      .setTitle('New modmail')
      .setThumbnail(user.displayAvatarURL())
      .setDescription(
        `Messages here are sent to <@${user.id}> by DM. Start a message with \`${INTERNAL_PREFIX}\` to keep it inside the thread.`,
      )
      .addFields(
        { name: 'User', value: `${user.tag} (${user.id})`, inline: false },
        { name: 'Account created', value: `<t:${Math.floor(user.createdTimestamp / 1000)}:R>`, inline: true },
        { name: 'Joined', value: member.joinedTimestamp ? `<t:${Math.floor(member.joinedTimestamp / 1000)}:R>` : 'Unknown', inline: true },
        { name: 'Earlier conversations', value: String(previous), inline: true },
      );
    const close = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId(`modmail:close:${thread.id}`).setLabel('Close conversation').setStyle(ButtonStyle.Danger),
    );
    await thread.send({ embeds: [header], components: [close], allowedMentions: { parse: [] } });

    const draft = drafts.get(user.id);
    drafts.delete(user.id);
    if (draft) await thread.send({ embeds: [relayEmbed(user, draft, Colors.INFO, 'From user')], allowedMentions: { parse: [] } });
    return null;
  },

  /** Staff message inside a modmail thread: forward to the user. */
  async handleThreadMessage(message: Message<true>): Promise<void> {
    if (!message.channel.isThread()) return;
    const userId = await threadOwner(message.channel.id);
    if (!userId || message.content.startsWith(INTERNAL_PREFIX)) return;
    try {
      const user = await message.client.users.fetch(userId);
      await user.send({ embeds: [relayEmbed(message.author, draftOf(message), Colors.SUCCESS, `Staff of ${message.guild.name}`)] });
      await message.react('✅').catch(() => undefined);
    } catch (error) {
      await message.react('❌').catch(() => undefined);
      await message.reply('Could not deliver this. The user may have closed their DMs.').catch(() => undefined);
      appLogger.warn('Modmail relay to user failed', 'Modmail', {
        guildId: message.guildId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  },

  async close(thread: ThreadChannel, closedBy: string): Promise<boolean> {
    const row = await prisma.modmailThread.findUnique({ where: { threadId: thread.id } });
    if (!row?.open) return false;
    await prisma.modmailThread.update({ where: { id: row.id }, data: { open: false, closedBy, closedAt: new Date() } });
    threadOwners.set(thread.id, '');
    const user = await thread.client.users.fetch(row.userId).catch(() => null);
    await user
      ?.send(`Your conversation with the staff of **${thread.guild.name}** was closed. Send a new message any time to start another.`)
      .catch(() => undefined);
    await thread.send(`Closed by <@${closedBy}>.`).catch(() => undefined);
    await thread.setLocked(true).catch(() => undefined);
    await thread.setArchived(true).catch(() => undefined);
    return true;
  },
};
