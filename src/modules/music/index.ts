import { entersState, joinVoiceChannel, VoiceConnectionStatus } from '@discordjs/voice';
import {
  ChannelType,
  PermissionFlagsBits,
  type GuildMember,
  type GuildTextBasedChannel,
  type VoiceBasedChannel,
  type VoiceState,
} from 'discord.js';
import { GuildMusic } from './player.js';
import { updateYtDlp } from './sources.js';

const sessions = new Map<string, GuildMusic>();
const UPDATE_EVERY_MS = 24 * 60 * 60_000;
let updateTimer: NodeJS.Timeout | null = null;

export type Access = { ok: true; session: GuildMusic } | { ok: false; reason: string };

function listeners(channel: VoiceBasedChannel | null | undefined): number {
  return channel?.members.filter((m) => !m.user.bot).size ?? 0;
}

export const musicModule = {
  get(guildId: string): GuildMusic | undefined {
    return sessions.get(guildId);
  },

  /** Why the bot can't play in this member's voice channel, or null when it can. */
  joinProblem(member: GuildMember): string | null {
    const channel = member.voice.channel;
    if (!channel || channel.type !== ChannelType.GuildVoice) return 'Join a voice channel first.';
    const me = member.guild.members.me;
    const perms = me ? channel.permissionsFor(me) : null;
    if (!perms?.has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect, PermissionFlagsBits.Speak]))
      return `I need the Connect and Speak permissions in ${channel}.`;
    if (channel.full && !perms.has(PermissionFlagsBits.MoveMembers)) return `${channel} is full.`;
    const session = sessions.get(member.guild.id);
    if (session && session.channelId !== channel.id && session.current && listeners(member.guild.channels.cache.get(session.channelId ?? '') as VoiceBasedChannel) > 0)
      return `I'm already playing in <#${session.channelId}>. Join that channel or wait until it's done.`;
    return null;
  },

  /** Joins (or moves to) the member's voice channel. Call joinProblem first. */
  async join(member: GuildMember, textChannel: GuildTextBasedChannel): Promise<GuildMusic> {
    const channel = member.voice.channel!;
    const existing = sessions.get(member.guild.id);
    if (existing && existing.channelId === channel.id) {
      existing.textChannel = textChannel;
      return existing;
    }
    existing?.destroy();

    const connection = joinVoiceChannel({
      channelId: channel.id,
      guildId: channel.guild.id,
      adapterCreator: channel.guild.voiceAdapterCreator,
      selfDeaf: true,
    });
    try {
      await entersState(connection, VoiceConnectionStatus.Ready, 20_000);
    } catch (error) {
      connection.destroy();
      throw error;
    }
    const session = new GuildMusic(channel.guild.id, connection, textChannel, () => {
      if (sessions.get(channel.guild.id) === session) sessions.delete(channel.guild.id);
    });
    sessions.set(channel.guild.id, session);
    return session;
  },

  /** Buttons and commands that change playback: the member must be listening with the bot. */
  control(member: GuildMember): Access {
    const session = sessions.get(member.guild.id);
    if (!session) return { ok: false, reason: 'Nothing is playing right now.' };
    if (member.voice.channelId !== session.channelId)
      return { ok: false, reason: `Join <#${session.channelId}> to control the music.` };
    return { ok: true, session };
  },

  handleVoiceState(oldState: VoiceState, newState: VoiceState): void {
    const session = sessions.get(newState.guild.id);
    if (!session) return;
    // Someone disconnected the bot by hand.
    if (newState.id === newState.client.user.id && !newState.channelId) {
      session.destroy();
      return;
    }
    if (oldState.channelId === newState.channelId) return;
    const channel = newState.guild.channels.cache.get(session.channelId ?? '') as VoiceBasedChannel | undefined;
    session.setAlone(listeners(channel) === 0);
  },

  start(): void {
    updateYtDlp();
    updateTimer = setInterval(updateYtDlp, UPDATE_EVERY_MS);
    updateTimer.unref();
  },

  stop(): void {
    if (updateTimer) clearInterval(updateTimer);
    updateTimer = null;
    for (const session of [...sessions.values()]) session.destroy();
  },
};
