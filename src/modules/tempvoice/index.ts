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
import { nextOwner, renderRoomName } from './logic.js';

const prisma = db.client;

const CONFIG_TTL_MS = 60_000;
/** One new room per member per this long, so hopping in and out of the hub cannot flood the server. */
const CREATE_COOLDOWN_MS = 10_000;
/** Rooms left behind while the bot was offline, or whose channel was deleted by hand, are cleaned up this often. */
const SWEEP_MS = 15 * 60_000;

/** What the owner of a room may do to it: rename, set a limit, move or disconnect people. */
const OWNER_PERMS = { ViewChannel: true, Connect: true, ManageChannels: true, MoveMembers: true } as const;
const OWNER_ALLOW = (Object.keys(OWNER_PERMS) as (keyof typeof OWNER_PERMS)[]).map((name) => PermissionFlagsBits[name]);

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
      permissionOverwrites: [{ id: member.id, type: OverwriteType.Member, allow: OWNER_ALLOW }],
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
  }
}

/** The owner left but others stayed: the room passes to someone still in it. */
async function handOver(channel: VoiceBasedChannel, oldOwnerId: string): Promise<void> {
  const heir = nextOwner(
    channel.members.map((m) => ({ id: m.id, bot: m.user.bot })),
    oldOwnerId,
  );
  if (!heir) return;
  rooms.set(channel.id, heir);
  await prisma.tempVoiceChannel.updateMany({ where: { channelId: channel.id }, data: { ownerId: heir } });
  try {
    await channel.permissionOverwrites.delete(oldOwnerId, 'Room owner left');
    await channel.permissionOverwrites.create(heir, OWNER_PERMS, {
      reason: 'New room owner',
      type: OverwriteType.Member,
    });
  } catch (error) {
    appLogger.warn('Could not hand over voice room', 'TempVoice', {
      channelId: channel.id,
      error: errorMessage(error),
    });
  }
}

async function handleVoiceState(oldState: VoiceState, newState: VoiceState): Promise<void> {
  if (oldState.channelId === newState.channelId) return;
  const guild = newState.guild;

  // Leaving a room: delete it when empty, otherwise hand it over if the owner was the one leaving.
  if (oldState.channelId && rooms.has(oldState.channelId)) {
    const channel = oldState.channel;
    if (!channel) {
      await forgetRoom(oldState.channelId);
    } else if (channel.members.filter((m) => !m.user.bot).size === 0) {
      await deleteRoom(channel);
    } else if (rooms.get(channel.id) === oldState.id) {
      await handOver(channel, oldState.id);
    }
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
