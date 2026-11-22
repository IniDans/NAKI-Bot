import { AttachmentBuilder, EmbedBuilder, type Attachment, type Guild, type User } from 'discord.js';
import { Colors } from '../../config/constants.js';
import { attachmentCache } from './attachmentCache.js';
import type { DeleteActor } from './deleteAudit.js';

/** Embeds for the message delete and edit logs, with deleted images re-uploaded. */

const MAX_GALLERY_IMAGES = 4; // Discord groups up to four embed images that share a URL
const DESCRIPTION_LIMIT = 4000;
const EDIT_SIDE_LIMIT = 1900;

export interface MessageLogFiles {
  embeds: EmbedBuilder[];
  files: AttachmentBuilder[];
  /** The main embed without image references, used if the upload is rejected. */
  fallbackEmbeds: EmbedBuilder[];
}

interface PreparedAttachments {
  files: AttachmentBuilder[];
  imageNames: string[];
  lines: string[];
}

/** Largest upload a bot may send in this guild, with a little headroom. */
export function uploadLimitBytes(guild: Pick<Guild, 'premiumTier'>): number {
  const mb = guild.premiumTier >= 3 ? 100 : guild.premiumTier === 2 ? 50 : 10;
  return Math.floor(mb * 1024 * 1024 * 0.95);
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function truncateText(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}

/** What to show for a message's text, covering empty and uncached messages. */
export function describeContent(content: string | null | undefined, hasAttachments: boolean, max: number): string {
  if (content === null || content === undefined) {
    return '*Content not available: the message was sent before the bot last started, so it was not cached.*';
  }
  if (!content.trim()) return hasAttachments ? '*No text, attachments only.*' : '*Empty message.*';
  return truncateText(content, max);
}

export function describeDeleter(actor: DeleteActor, author: User | null): string {
  switch (actor.kind) {
    case 'moderator':
      return `<@${actor.user.id}> (\`${actor.user.tag}\`)${actor.user.bot ? ' · bot' : ''}`;
    case 'author':
      return author ? `<@${author.id}> (the author)` : 'The author';
    case 'unknown':
      return `Unknown (${actor.reason})`;
  }
}

async function prepareAttachments(attachments: Attachment[], budget: number): Promise<PreparedAttachments> {
  const prepared: PreparedAttachments = { files: [], imageNames: [], lines: [] };
  const usedNames = new Set<string>();
  let remaining = budget;
  for (const attachment of attachments) {
    const label = `\`${truncateText(attachment.name, 60)}\` (${formatBytes(attachment.size)})`;
    const fetched = remaining > 0 ? await attachmentCache.fetch(attachment, remaining) : null;
    if (!fetched) {
      prepared.lines.push(`${label}: could not be saved`);
      continue;
    }
    let name = fetched.name;
    for (let i = 2; usedNames.has(name); i++) name = `${i}-${fetched.name}`;
    usedNames.add(name);
    remaining -= fetched.data.length;
    prepared.files.push(new AttachmentBuilder(fetched.data, { name }));
    const isImage = Boolean(attachment.contentType?.startsWith('image/'));
    if (isImage && prepared.imageNames.length < MAX_GALLERY_IMAGES) prepared.imageNames.push(name);
    prepared.lines.push(`${label}: ${isImage ? 'shown below' : 'attached'}`);
  }
  return prepared;
}

function withGallery(main: EmbedBuilder, imageNames: string[], galleryUrl: string): EmbedBuilder[] {
  if (!imageNames.length) return [main];
  main.setURL(galleryUrl).setImage(`attachment://${imageNames[0]}`);
  const extras = imageNames.slice(1).map((name) => new EmbedBuilder().setURL(galleryUrl).setImage(`attachment://${name}`));
  return [main, ...extras];
}

function authorHeader(embed: EmbedBuilder, author: User | null): void {
  if (author) embed.setAuthor({ name: author.tag, iconURL: author.displayAvatarURL() });
}

/** Attachment lines; when the upload was rejected, saved files are reported as such. */
function attachmentLines(prepared: PreparedAttachments, uploaded: boolean): string[] {
  return uploaded ? prepared.lines : prepared.lines.map((line) => line.replace(/: (shown below|attached)$/, ': too large to upload here'));
}

function attachmentField(lines: string[]): { name: string; value: string } {
  return { name: `📎 Attachments (${lines.length})`, value: truncateText(lines.join('\n'), 1024) };
}

export async function buildDeleteLog(input: {
  guild: Guild;
  channelId: string;
  messageId: string;
  author: User | null;
  content: string | null | undefined;
  createdTimestamp: number | null;
  attachments: Attachment[];
  deleter: DeleteActor;
}): Promise<MessageLogFiles> {
  const { guild, channelId, messageId, author, attachments } = input;
  const prepared = await prepareAttachments(attachments, uploadLimitBytes(guild));

  const make = (uploaded: boolean) => {
    const embed = new EmbedBuilder()
      .setColor(Colors.LOG_DELETE)
      .setTitle('🗑️ Message Deleted')
      .setDescription(describeContent(input.content, attachments.length > 0, DESCRIPTION_LIMIT))
      .addFields(
        { name: 'Author', value: author ? `<@${author.id}> (\`${author.tag}\`)` : 'Unknown (not cached)', inline: true },
        { name: 'Deleted By', value: describeDeleter(input.deleter, author), inline: true },
        { name: 'Channel', value: `<#${channelId}>`, inline: true },
      )
      .setFooter({ text: `Guild: ${guild.name}` })
      .setTimestamp();
    authorHeader(embed, author);
    if (input.createdTimestamp) embed.addFields({ name: 'Sent', value: `<t:${Math.floor(input.createdTimestamp / 1000)}:f>`, inline: true });
    if (prepared.lines.length) embed.addFields(attachmentField(attachmentLines(prepared, uploaded)));
    embed.addFields({ name: '🔑 IDs', value: `**Message ID:** \`${messageId}\`${author ? `\n**Author ID:** \`${author.id}\`` : ''}` });
    return embed;
  };

  return {
    embeds: withGallery(make(true), prepared.imageNames, `https://discord.com/channels/${guild.id}/${channelId}`),
    files: prepared.files,
    fallbackEmbeds: [make(false)],
  };
}

export async function buildEditLog(input: {
  guild: Guild;
  channelId: string;
  messageId: string;
  url: string;
  author: User | null;
  before: string | null | undefined;
  after: string | null | undefined;
  removedAttachments: Attachment[];
}): Promise<MessageLogFiles> {
  const { guild, channelId, messageId, author, removedAttachments } = input;
  const prepared = await prepareAttachments(removedAttachments, uploadLimitBytes(guild));
  const contentChanged = input.before !== input.after;

  const make = (uploaded: boolean) => {
    const parts: string[] = [];
    if (contentChanged) {
      parts.push(`**Before**\n${describeContent(input.before, false, EDIT_SIDE_LIMIT)}`);
      parts.push(`**After**\n${describeContent(input.after, false, EDIT_SIDE_LIMIT)}`);
    } else {
      parts.push('*Text unchanged. Attachments were removed.*');
    }
    const embed = new EmbedBuilder()
      .setColor(Colors.LOG_UPDATE)
      .setTitle('✏️ Message Edited')
      .setDescription(parts.join('\n\n'))
      .addFields(
        { name: 'Author', value: author ? `<@${author.id}> (\`${author.tag}\`)` : 'Unknown (not cached)', inline: true },
        { name: 'Channel', value: `<#${channelId}>`, inline: true },
        { name: 'Message', value: `[Jump to message](${input.url})`, inline: true },
      )
      .setFooter({ text: `Guild: ${guild.name}` })
      .setTimestamp();
    authorHeader(embed, author);
    if (prepared.lines.length) embed.addFields({ ...attachmentField(attachmentLines(prepared, uploaded)), name: `📎 Removed Attachments (${prepared.lines.length})` });
    embed.addFields({ name: '🔑 IDs', value: `**Message ID:** \`${messageId}\`${author ? `\n**Author ID:** \`${author.id}\`` : ''}` });
    return embed;
  };

  return {
    embeds: withGallery(make(true), prepared.imageNames, input.url),
    files: prepared.files,
    fallbackEmbeds: [make(false)],
  };
}
