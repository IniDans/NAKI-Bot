import { MessageFlags } from 'discord.js';
import { musicModule } from '../modules/music/index.js';
import { nextLoop } from '../modules/music/logic.js';
import { queueEmbed } from '../modules/music/panel.js';
import { embedUtils } from '../utils/embed.js';
import type { ComponentHandler } from '../types/index.js';

/** Now-playing buttons: `music:pause|skip|stop|loop|shuffle|queue`. Only people in the bot's voice channel can use them. */
const handler: ComponentHandler = {
  prefix: 'music',
  async execute(interaction, [action]) {
    if (!interaction.isButton() || !interaction.inCachedGuild()) return;
    const access = musicModule.control(interaction.member);
    if (!access.ok) {
      await interaction.reply({ embeds: [embedUtils.error('Music', access.reason)], flags: MessageFlags.Ephemeral });
      return;
    }
    const session = access.session;
    const who = interaction.member.displayName;

    if (action === 'queue') {
      await interaction.reply({ embeds: [queueEmbed(session.state())], flags: MessageFlags.Ephemeral });
      return;
    }
    // The session edits or replaces the now-playing message itself.
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
