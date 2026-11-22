import { EmbedBuilder, MessageFlags, PermissionsBitField, SlashCommandBuilder } from 'discord.js';
import { Colors } from '../../config/constants.js';
import type { Command } from '../../types/index.js';

/** Plain-language help, grouped. Only shows the commands the person can actually use. */
const SECTIONS: { title: string; items: [name: string, text: string][] }[] = [
  {
    title: '🎵 Music',
    items: [
      ['play', 'Type a song name or paste a YouTube/Spotify link. Join a voice channel first.'],
      ['skip', 'Go to the next song.'],
      ['pause', 'Pause the music. Use it again to continue.'],
      ['stop', 'Stop the music, clear the list and make NAKI leave.'],
      ['queue', 'See what is playing next. Shuffle, repeat or remove songs from there.'],
    ],
  },
  {
    title: '⭐ Levels',
    items: [
      ['rank', 'See your level, or someone else’s.'],
      ['leaderboard', 'See who chats the most.'],
    ],
  },
  {
    title: '🛡️ Keeping the server safe',
    items: [
      ['warn', 'Give a warning. Too many warnings can lead to an automatic punishment.'],
      ['timeout', 'Stop someone from chatting for a while, e.g. 10 minutes.'],
      ['untimeout', 'End a timeout early.'],
      ['kick', 'Remove someone. They can come back with an invite.'],
      ['ban', 'Remove someone for good, or only for a while.'],
      ['unban', 'Let a banned person come back.'],
      ['history', 'See everything that happened with a member: warnings, bans, notes.'],
      ['note', 'Write a private note about a member. Only moderators see it.'],
      ['case', 'Look at one past action, fix its reason or delete it.'],
    ],
  },
  {
    title: '💬 Channels & messages',
    items: [
      ['clear', 'Delete the latest messages in a channel.'],
      ['lock', 'Stop members from chatting in a channel.'],
      ['unlock', 'Open a locked channel again.'],
      ['slowmode', 'Make members wait between messages.'],
      ['embed', 'Post a nice boxed message for rules or announcements.'],
      ['modmail', 'Close a private conversation with a member.'],
    ],
  },
  {
    title: '⚙️ Server',
    items: [
      ['role', 'Give or take away a role, forever or for a while.'],
      ['giveaway', 'Start a giveaway, finish it early or pick new winners.'],
      ['lockdown', 'Emergency: stop everyone from chatting in all channels.'],
      ['dashboard', 'Open the website where all the bot settings are.'],
    ],
  },
];

const command: Command = {
  data: new SlashCommandBuilder().setName('help').setDescription('See what NAKI can do and how to use it'),

  async execute(interaction) {
    const perms = interaction.memberPermissions;
    const canUse = (name: string) => {
      const registered = interaction.client.commands.get(name);
      if (!registered) return false;
      const needed = registered.data.toJSON().default_member_permissions;
      if (!needed) return true;
      // In DMs only the commands everyone can use make sense.
      return perms ? perms.has(new PermissionsBitField(BigInt(needed))) : false;
    };

    const embed = new EmbedBuilder()
      .setColor(Colors.INFO)
      .setTitle('How to use NAKI')
      .setDescription('Type `/` in the chat and pick a command. Discord shows what to fill in for each one.');

    for (const section of SECTIONS) {
      const lines = section.items.filter(([name]) => canUse(name)).map(([name, text]) => `**/${name}** - ${text}`);
      if (lines.length) embed.addFields({ name: section.title, value: lines.join('\n') });
    }
    embed.setFooter({ text: 'You only see the commands you are allowed to use.' });

    await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
  },
};

export default command;
