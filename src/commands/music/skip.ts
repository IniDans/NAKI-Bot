import { SlashCommandBuilder } from 'discord.js';
import { withSession } from '../../modules/music/commands.js';
import type { Command } from '../../types/index.js';

const command: Command = {
  data: new SlashCommandBuilder().setName('skip').setDescription('Skip this song and play the next one'),
  guildOnly: true,
  execute: (interaction) =>
    withSession(interaction, (session) => {
      const title = session.current?.title;
      if (!session.skip()) return 'Nothing is playing. Start something with `/play`.';
      return session.queue.length || session.loop === 'queue'
        ? `⏭️ Skipped **${title}**.`
        : `⏭️ Skipped **${title}**. That was the last song in the queue.`;
    }),
};
export default command;
