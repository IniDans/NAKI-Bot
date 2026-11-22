import {
  ChannelType,
  type Client,
  type Guild,
  type GuildMember,
  OverwriteType,
  PermissionFlagsBits,
  type VoiceBasedChannel,
  type VoiceState,
} from 'discord.js';
import { db } from '../../services/database/index.js';
import { appLogger } from '../../utils/logger.js';
import { renderRoomName } from './logic.js';
import { forgetPanel, postPanel, refreshPanel } from './panel.js';

const prisma = db.client;

const CONFIG_TTL_MS = 60_000;
/** One new room per member per this long, so hopping in and out of the hub cannot flood the server. */
const CREATE_COOLDOWN_MS = 10_000;
/** Rooms left behind while the bot was offline, or whose channel was deleted by hand, are cleaned up this often. */
const SWEEP_MS = 15 * 60_000;

/** What the owner of a room may do to it: rename, set a limit, move or disconnect people, and chat when chat is off. */
const OWNER_PERMS = { ViewChannel: true, Connect: true, SendMessages: true, ManageChannels: true, MoveMembers: true } as const;
const OWNER_ALLOW = (Object.keys(OWNER_PERMS) as (keyof typeof OWNER_PERMS)[]).map((name) => PermissionFlagsBits[name]);
/** The bot keeps access to a room it manages even when the owner hides or locks it. */
const BOT_ALLOW = [
  PermissionFlagsBits.ViewChannel,
  PermissionFlagsBits.Connect,
  PermissionFlagsBits.SendMessages,
  PermissionFlagsBits.EmbedLinks,
  PermissionFlagsBits.ReadMessageHistory,
  PermissionFlagsBits.ManageChannels,
  PermissionFlagsBits.MoveMembers,
];

type Config = {
  enabled: boolean;
  hubChannelId: string | null;
  categoryId: string | null;
  nameTemplate: string;
  userLimit: number;
};

const configCache = new Map<string, { config: Config | null; at: number }>();
/** channelId -> ownerId for every live room, loaded from the database at startup. */
const rooms = new Map<string, string>();
const lastCreate = new Map<string, number>();
let sweepTimer: NodeJS.Timeout | null = null;

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function configFor(guildId: string): Promise<Config | null> {
  const hit = configCache.get(guildId);
  if (hit && Date.now() - hit.at < CONFIG_TTL_MS) return hit.config;
  const config = await prisma.tempVoiceConfig.findUnique({ where: { guildId } });
  configCache.set(guildId, { config, at: Date.now() });
  return config;
}

async function forgetRoom(channelId: string): Promise<void> {
  rooms.delete(channelId);
  forgetPanel(channelId);
  await prisma.tempVoiceChannel.deleteMany({ where: { channelId } });
}

async function deleteRoom(channel: VoiceBasedChannel): Promise<void> {
  await forgetRoom(channel.id);
  await channel.delete('Temporary voice room is empty').catch((error) => {
    appLogger.warn('Could not delete empty voice room', 'TempVoice', {
      channelId: channel.id,
      error: errorMessage(error),
    });
  });
}

async function createRoom(member: GuildMember, hub: VoiceBasedChannel, config: Config): Promise<void> {
  // Someone who already has a room is sent back to it instead of getting a second one.
  for (const [channelId, ownerId] of rooms) {
    if (ownerId !== member.id) continue;
    const existing = member.guild.channels.cache.get(channelId);
    if (existing?.isVoiceBased()) {
      await member.voice.setChannel(existing).catch(() => undefined);
      return;
    }
  }

  const key = `${member.guild.id}:${member.id}`;
  if (Date.now() - (lastCreate.get(key) ?? 0) < CREATE_COOLDOWN_MS) return;
  lastCreate.set(key, Date.now());

  const parent = config.categoryId ?? hub.parentId ?? undefined;
  let channel;
  try {
    channel = await member.guild.channels.create({
      name: renderRoomName(config.nameTemplate, { displayName: member.displayName, username: member.user.username }),
      type: ChannelType.GuildVoice,
      parent,
      userLimit: config.userLimit,
      bitrate: hub.bitrate,
      permissionOverwrites: [
        { id: member.id, type: OverwriteType.Member, allow: OWNER_ALLOW },
        { id: member.client.user.id, type: OverwriteType.Member, allow: BOT_ALLOW },
      ],
      reason: `Temporary voice room for ${member.user.tag}`,
    });
  } catch (error) {
    appLogger.warn('Could not create voice room', 'TempVoice', {
      guildId: member.guild.id,
      error: errorMessage(error),
    });
    return;
  }

  rooms.set(channel.id, member.id);
  await prisma.tempVoiceChannel.create({
    data: { guildId: member.guild.id, channelId: channel.id, ownerId: member.id },
  });

  try {
    await member.voice.setChannel(channel, 'Moved into their new voice room');
  } catch {
    // They left the hub before the room was ready.
    if (channel.members.size === 0) await deleteRoom(channel);
    return;
  }

  await postPanel(channel, member.id).catch((error) => {
    appLogger.warn('Could not post voice room panel', 'TempVoice', {
      channelId: channel.id,
      error: errorMessage(error),
    });
  });
}

/**
 * Make someone else the owner (Transfer or Claim). The old owner loses their owner
 * permissions; the new owner's overwrite replaces any trust or kick they had.
 */
async function setOwner(channel: VoiceBasedChannel, newOwnerId: string, reason: string): Promise<void> {
  const oldOwnerId = rooms.get(channel.id);
  rooms.set(channel.id, newOwnerId);
  await prisma.tempVoiceChannel.updateMany({ where: { channelId: channel.id }, data: { ownerId: newOwnerId } });
  if (oldOwnerId && oldOwnerId !== newOwnerId) {
    await channel.permissionOverwrites.delete(oldOwnerId, reason).catch(() => undefined);
  }
  await channel.permissionOverwrites.create(newOwnerId, OWNER_PERMS, { reason, type: OverwriteType.Member });
}

/** The owner left but others stayed: the room keeps its owner until someone claims it. */
async function ownerLeft(channel: VoiceBasedChannel, ownerId: string): Promise<void> {
  try {
    await refreshPanel(channel, ownerId);
    await channel.send({
      content: `<@${ownerId}> left the room. Anyone here can press **Claim** on the panel to take over.`,
      allowedMentions: { parse: [] },
    });
  } catch (error) {
    appLogger.warn('Could not announce that the room owner left', 'TempVoice', {
      channelId: channel.id,
      error: errorMessage(error),
    });
  }
}

async function handleVoiceState(oldState: VoiceState, newState: VoiceState): Promise<void> {
  if (oldState.channelId === newState.channelId) return;
  const guild = newState.guild;

  // Leaving a room: delete it when empty, otherwise tell the others they can claim it if the owner left.
  if (oldState.channelId && rooms.has(oldState.channelId)) {
    const channel = oldState.channel;
    if (!channel) {
      await forgetRoom(oldState.channelId);
    } else if (channel.members.filter((m) => !m.user.bot).size === 0) {
      await deleteRoom(channel);
    } else if (rooms.get(channel.id) === oldState.id) {
      await ownerLeft(channel, oldState.id);
    }
  }

  // The owner coming back: the panel stops offering Claim. A brand-new room's panel is
  // still being posted by createRoom, so never post one from here.
  if (newState.channelId && rooms.get(newState.channelId) === newState.id && newState.channel) {
    await refreshPanel(newState.channel, newState.id, false).catch(() => undefined);
  }

  // Joining the hub: create a room and move the member into it.
  const member = newState.member;
  if (!newState.channel || !member || member.user.bot) return;
  const config = await configFor(guild.id);
  if (!config?.enabled || newState.channelId !== config.hubChannelId) return;
  await createRoom(member, newState.channel, config);
}

/** Drops rows whose channel is gone and deletes rooms that emptied while the bot was offline. */
async function sweep(client: Client): Promise<void> {
  const rows = await prisma.tempVoiceChannel.findMany();
  for (const row of rows) {
    const guild: Guild | undefined = client.guilds.cache.get(row.guildId);
    if (!guild) continue;
    const channel = guild.channels.cache.get(row.channelId);
    if (!channel?.isVoiceBased()) {
      await forgetRoom(row.channelId);
    } else if (channel.members.filter((m) => !m.user.bot).size === 0) {
      await deleteRoom(channel);
    } else {
      rooms.set(row.channelId, row.ownerId);
    }
  }
}

export const tempVoiceModule = {
  handleVoiceState,
  setOwner,

  invalidate(guildId: string): void {
    configCache.delete(guildId);
  },

  /** The owner of a live room, or null if the channel is not a temporary room. */
  ownerOf(channelId: string): string | null {
    return rooms.get(channelId) ?? null;
  },

  start(client: Client): void {
    const run = () =>
      sweep(client).catch((error) => {
        appLogger.error('Temp voice sweep failed', 'TempVoice', { error: errorMessage(error) });
      });
    void run();
    sweepTimer = setInterval(run, SWEEP_MS);
  },

  stop(): void {
    if (sweepTimer) clearInterval(sweepTimer);
    sweepTimer = null;
  },
};
