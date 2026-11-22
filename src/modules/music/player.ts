import {
  AudioPlayerStatus,
  createAudioPlayer,
  createAudioResource,
  entersState,
  NoSubscriberBehavior,
  StreamType,
  VoiceConnectionStatus,
  type AudioResource,
  type VoiceConnection,
} from '@discordjs/voice';
import type { GuildTextBasedChannel, Message } from 'discord.js';
import { embedUtils } from '../../utils/embed.js';
import { appLogger } from '../../utils/logger.js';
import { advance, MAX_QUEUE_SIZE, shuffled, type LoopMode, type Track } from './logic.js';
import { controls, nowPlayingEmbed, type PanelState } from './panel.js';
import { ensurePlayable, openStream, type AudioStream } from './sources.js';

const IDLE_LEAVE_MS = 3 * 60_000;
const ALONE_LEAVE_MS = 2 * 60_000;
const MAX_FAILURES_IN_A_ROW = 3;

let nextKey = 0;

const errorMessage = (error: unknown) => (error instanceof Error ? error.message : String(error));

/** One server's music: its voice connection, queue and now-playing message. */
export class GuildMusic {
  queue: Track[] = [];
  current: Track | null = null;
  loop: LoopMode = 'off';

  private readonly player = createAudioPlayer({ behaviors: { noSubscriber: NoSubscriberBehavior.Pause } });
  private resource: AudioResource | null = null;
  private audio: AudioStream | null = null;
  private panel: Message | null = null;
  private skipped = false;
  private starting = false;
  private failures = 0;
  private destroyed = false;
  private idleTimer: NodeJS.Timeout | null = null;
  private aloneTimer: NodeJS.Timeout | null = null;

  constructor(
    readonly guildId: string,
    readonly connection: VoiceConnection,
    public textChannel: GuildTextBasedChannel,
    private readonly onDestroy: () => void,
  ) {
    connection.subscribe(this.player);
    this.player.on(AudioPlayerStatus.Idle, () => void this.finished());
    this.player.on('error', (error) =>
      appLogger.warn('Audio player error', 'Music', { guildId, track: this.current?.title, error: error.message }),
    );
    // Discord moves voice servers now and then; give the connection a moment to come back.
    connection.on(VoiceConnectionStatus.Disconnected, async () => {
      try {
        await Promise.race([
          entersState(connection, VoiceConnectionStatus.Signalling, 5_000),
          entersState(connection, VoiceConnectionStatus.Connecting, 5_000),
        ]);
      } catch {
        this.destroy();
      }
    });
    connection.on(VoiceConnectionStatus.Destroyed, () => this.destroy());
  }

  get channelId(): string | null {
    return this.connection.joinConfig.channelId;
  }

  get paused(): boolean {
    return this.player.state.status === AudioPlayerStatus.Paused;
  }

  state(): PanelState {
    return {
      current: this.current,
      queue: this.queue,
      loop: this.loop,
      paused: this.paused,
      elapsedSec: this.resource ? this.resource.playbackDuration / 1000 : 0,
    };
  }

  /** Adds tracks and starts playing if idle. Returns how many fit in the queue. */
  add(tracks: Track[], next = false): number {
    const fit = tracks.slice(0, Math.max(0, MAX_QUEUE_SIZE - this.queue.length));
    for (const track of fit) track.key = String(++nextKey);
    if (next) this.queue.unshift(...fit);
    else this.queue.push(...fit);
    if (!this.current && !this.starting && fit.length) void this.moveOn(true);
    else void this.refreshPanel();
    return fit.length;
  }

  skip(): boolean {
    if (!this.current) return false;
    this.skipped = true;
    // Stopping goes through Idle, which plays the next track. While a track is still
    // being looked up there is nothing to stop yet; start() checks the flag.
    if (!this.starting) this.player.stop(true);
    return true;
  }

  togglePause(): boolean {
    if (this.paused) this.player.unpause();
    else this.player.pause();
    return this.paused;
  }

  pause(): boolean {
    return this.player.pause();
  }

  resume(): boolean {
    return this.player.unpause();
  }

  shuffle(): void {
    this.queue = shuffled(this.queue);
    void this.refreshPanel();
  }

  setLoop(mode: LoopMode): void {
    this.loop = mode;
    void this.refreshPanel();
  }

  /** Removes a waiting song by its key (from the queue menu). */
  remove(key: string): Track | null {
    const index = this.queue.findIndex((t) => t.key === key);
    if (index < 0) return null;
    const [removed] = this.queue.splice(index, 1);
    void this.refreshPanel();
    return removed;
  }

  /** Empties the waiting list; the current song keeps playing. */
  clear(): number {
    const count = this.queue.length;
    this.queue = [];
    void this.refreshPanel();
    return count;
  }

  /** Called on every voice change in the bot's channel. */
  setAlone(alone: boolean): void {
    if (!alone) {
      if (this.aloneTimer) clearTimeout(this.aloneTimer);
      this.aloneTimer = null;
      return;
    }
    this.aloneTimer ??= setTimeout(() => {
      void this.notice('👋 Left the voice channel because everyone left.');
      this.destroy();
    }, ALONE_LEAVE_MS);
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    for (const timer of [this.idleTimer, this.aloneTimer]) if (timer) clearTimeout(timer);
    this.queue = [];
    this.current = null;
    this.audio?.kill();
    this.player.stop(true);
    if (this.connection.state.status !== VoiceConnectionStatus.Destroyed) this.connection.destroy();
    void this.closePanel();
    this.onDestroy();
  }

  // ─── Playback ─────────────────────────────────────────────────────────────

  private async finished(): Promise<void> {
    if (this.destroyed || this.starting) return;
    // A track that ends within a second with an error never really played. Skipping
    // right after it starts also kills yt-dlp, so that does not count.
    const failed =
      !this.skipped && this.audio && this.resource && this.resource.playbackDuration < 1000 ? this.audio.error() : null;
    this.audio?.kill();
    this.audio = null;
    this.resource = null;
    if (failed && this.current) {
      appLogger.warn('Track failed to play', 'Music', { guildId: this.guildId, track: this.current.title, error: failed });
      await this.notice(`⚠️ Couldn't play **${this.current.title}**, skipping.`);
      if (++this.failures >= MAX_FAILURES_IN_A_ROW) return this.giveUp();
    }
    await this.moveOn(this.skipped || Boolean(failed));
  }

  private async moveOn(skipped: boolean): Promise<void> {
    const next = advance(this.current, this.queue, this.loop, skipped);
    this.skipped = false;
    this.current = next.current;
    this.queue = next.queue;
    await this.start();
  }

  private async start(): Promise<void> {
    const track = this.current;
    if (!track) return this.wentIdle();
    if (this.idleTimer) clearTimeout(this.idleTimer);
    this.idleTimer = null;

    this.starting = true;
    let found = false;
    try {
      found = await ensurePlayable(track);
    } catch (error) {
      appLogger.warn('YouTube lookup failed', 'Music', { guildId: this.guildId, track: track.title, error: errorMessage(error) });
    } finally {
      this.starting = false;
    }
    if (this.destroyed || this.current !== track) return;
    if (!found || this.skipped) {
      if (!found) {
        await this.notice(`⚠️ Couldn't find **${track.title}** on YouTube, skipping.`);
        if (++this.failures >= MAX_FAILURES_IN_A_ROW) return this.giveUp();
      }
      return this.moveOn(true);
    }

    this.audio = openStream(track.youtubeId!);
    this.resource = createAudioResource(this.audio.stream, { inputType: StreamType.OggOpus });
    this.player.play(this.resource);
    // Count the track as working once it has actually played for a bit.
    const resource = this.resource;
    setTimeout(() => {
      if (this.resource === resource && resource.playbackDuration > 0) this.failures = 0;
    }, 5_000).unref();
    await this.postPanel();
    // Look up the next Spotify track now so it starts without a pause.
    if (this.queue[0]) void ensurePlayable(this.queue[0]).catch(() => undefined);
  }

  private async giveUp(): Promise<void> {
    this.failures = 0;
    await this.notice('⚠️ Several songs in a row failed to play, so the queue was cleared. YouTube may be blocking requests for a while.');
    this.queue = [];
    this.current = null;
    await this.wentIdle();
  }

  private async wentIdle(): Promise<void> {
    this.current = null;
    await this.closePanel('✅ Queue finished. Add more with `/play`.');
    if (this.idleTimer) clearTimeout(this.idleTimer);
    this.idleTimer = setTimeout(() => this.destroy(), IDLE_LEAVE_MS);
  }

  // ─── Messages ─────────────────────────────────────────────────────────────

  async notice(text: string): Promise<void> {
    await this.textChannel.send({ embeds: [embedUtils.info('Music', text)] }).catch(() => undefined);
  }

  /** A fresh now-playing message for every track, so it stays at the bottom of the chat. */
  private async postPanel(): Promise<void> {
    const old = this.panel;
    this.panel = null;
    await old?.delete().catch(() => undefined);
    const state = this.state();
    this.panel = await this.textChannel
      .send({ embeds: [nowPlayingEmbed(state)], components: controls(state) })
      .catch((error) => {
        appLogger.warn('Could not post the now-playing message', 'Music', { guildId: this.guildId, error: errorMessage(error) });
        return null;
      });
  }

  async refreshPanel(): Promise<void> {
    if (!this.panel || !this.current) return;
    const state = this.state();
    await this.panel.edit({ embeds: [nowPlayingEmbed(state)], components: controls(state) }).catch(() => undefined);
  }

  /** Turns the last now-playing message into a plain note without buttons. */
  private async closePanel(text = '⏹️ Music stopped.'): Promise<void> {
    const panel = this.panel;
    this.panel = null;
    await panel?.edit({ embeds: [embedUtils.info('Music', text)], components: [] }).catch(() => undefined);
  }

  isPanel(messageId: string): boolean {
    return this.panel?.id === messageId;
  }
}
