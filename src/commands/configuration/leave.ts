import { SlashCommandBuilder, ChatInputCommandInteraction, PermissionFlagsBits, ChannelType, TextChannel } from 'discord.js';
import { guildService } from '../../services/database/guild.service.js';
import { leaveModule, DEFAULT_LEAVE_MESSAGE } from '../../modules/leave/index.js';
import { embedUtils } from '../../utils/embed.js';
import type { Command } from '../../types/index.js';

const command: Command = {
  data: new SlashCommandBuilder().setName('leave').setDescription('Configure leave messages').setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((s) => s.setName('setup').setDescription('Configure the leave channel and message')
      .addChannelOption((o) => o.setName('channel').setDescription('Leave channel').setRequired(true).addChannelTypes(ChannelType.GuildText))
      .addStringOption((o) => o.setName('message').setDescription('Message with placeholders')))
    .addSubcommand((s) => s.setName('enable').setDescription('Enable leave messages'))
    .addSubcommand((s) => s.setName('disable').setDescription('Disable leave messages'))
    .addSubcommand((s) => s.setName('message').setDescription('Change the leave message').addStringOption((o) => o.setName('text').setDescription('Message').setRequired(true)))
    .addSubcommand((s) => s.setName('test').setDescription('Send a leave preview using your account')),
  requiredPermissions: [PermissionFlagsBits.ManageGuild], rateLimitCategory: 'ADMIN', guildOnly: true,
  async execute(interaction: ChatInputCommandInteraction) {
    const guildId = interaction.guildId!; const sub = interaction.options.getSubcommand();
    if (sub === 'setup') {
      const channel = interaction.options.getChannel('channel', true); const message = interaction.options.getString('message') ?? DEFAULT_LEAVE_MESSAGE;
      await guildService.updateLeaveConfig(guildId, { channelId: channel.id, message, enabled: true });
      await interaction.reply({ embeds: [embedUtils.success('Leave Configured', `Leave messages will be sent to <#${channel.id}>.`)], ephemeral: true }); return;
    }
    if (sub === 'enable' || sub === 'disable') {
      await guildService.updateLeaveConfig(guildId, { enabled: sub === 'enable' });
      await interaction.reply({ embeds: [embedUtils.success('Leave Updated', `Leave messages are now **${sub === 'enable' ? 'enabled' : 'disabled'}**.`)], ephemeral: true }); return;
    }
    if (sub === 'message') {
      await guildService.updateLeaveConfig(guildId, { message: interaction.options.getString('text', true) });
      await interaction.reply({ embeds: [embedUtils.success('Leave Message Updated', 'The new message has been saved.')], ephemeral: true }); return;
    }
    const config = await guildService.getLeaveConfig(guildId);
    if (!config.channelId) { await interaction.reply({ embeds: [embedUtils.error('Not Configured', 'Run `/leave setup` first.')], ephemeral: true }); return; }
    const channel = interaction.guild!.channels.cache.get(config.channelId);
    if (!(channel instanceof TextChannel)) { await interaction.reply({ embeds: [embedUtils.error('Invalid Channel', 'The configured channel is missing or is not text-based.')], ephemeral: true }); return; }
    await leaveModule.handleMemberLeave(interaction.member as import('discord.js').GuildMember);
    await interaction.reply({ embeds: [embedUtils.success('Leave Test Sent', `Preview sent to <#${channel.id}>.`)], ephemeral: true });
  },
};
export default command;


