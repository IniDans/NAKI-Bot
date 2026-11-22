import { MessageFlags } from 'discord.js';
import { musicModule } from '../modules/music/index.js';
import { nextLoop } from '../modules/music/logic.js';
import { queueControls, queueEmbed } from '../modules/music/panel.js';
import { embedUtils } from '../utils/embed.js';
import type { ComponentHandler } from '../types/index.js';

/**
 * Music buttons. Only people in the bot's voice channel can use them.
 * - Now-playing message: `music:pause|skip|stop|loop|shuffle|queue`
 * - Queue view (from /queue or the Queue button): `music:qpage|qshuffle|qloop|qclear|qremove:<page>`
 */
const handler: ComponentHandler = {
  prefix: 'music',
  async execute(interaction, [action, pageArg]) {
    if (!interaction.inCachedGuild() || !(interaction.isButton() || interaction.isStringSelectMenu())) return;
    const access = musicModule.control(interaction.member);
    if (!access.ok) {
      await interaction.reply({ embeds: [embedUtils.error('Music', access.reason)], flags: MessageFlags.Ephemeral });
      return;
    }
    const session = access.session;
    const who = interaction.member.displayName;

    if (action === 'queue') {
      const state = session.state();
      await interaction.reply({ embeds: [queueEmbed(state)], components: queueControls(state), flags: MessageFlags.Ephemeral });
      return;
    }

    // Queue view: change something, then redraw the same private message.
    if (action.startsWith('q')) {
      const page = Number(pageArg) || 1;
      let note: string | null = null;
      switch (action) {
        case 'qshuffle':
          session.shuffle();
          break;
        case 'qloop':
          session.setLoop(nextLoop(session.loop));
          break;
        case 'qclear': {
          const count = session.clear();
          if (count) await session.notice(`🗑️ **${who}** cleared the queue (${count} songs).`);
          break;
        }
        case 'qremove': {
          if (!interaction.isStringSelectMenu()) return;
          const removed = session.remove(interaction.values[0]);
          note = removed ? `Removed **${removed.title}**.` : 'That song is no longer in the queue.';
          break;
        }
      }
      const state = session.state();
      const embed = queueEmbed(state, page);
      if (note) embed.setAuthor({ name: note.replace(/\*\*/g, '') });
      await interaction.update({ embeds: [embed], components: queueControls(state, page) });
      return;
    }

    // Now-playing message: the session edits or replaces it itself.
    await interaction.deferUpdate();
    switch (action) {
      case 'pause':
        session.togglePause();
        await session.refreshPanel();
        break;
      case 'skip': {
        const title = session.current?.title;
        if (session.skip()) await session.notice(`⏭️ **${who}** skipped **${title}**.`);
        break;
      }
      case 'stop':
        await session.notice(`⏹️ **${who}** stopped the music.`);
        session.destroy();
        break;
      case 'loop':
        session.setLoop(nextLoop(session.loop));
        break;
      case 'shuffle':
        session.shuffle();
        break;
    }
  },
};
export default handler;
