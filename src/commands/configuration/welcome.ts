import { SlashCommandBuilder, ChatInputCommandInteraction, PermissionFlagsBits, ChannelType, GuildMember, TextChannel } from 'discord.js';
import { guildService } from '../../services/database/guild.service.js';
import { welcomeModule, DEFAULT_WELCOME_MESSAGE } from '../../modules/welcome/index.js';
import { embedUtils } from '../../utils/embed.js';
import type { Command } from '../../types/index.js';

const command: Command = {
  data: new SlashCommandBuilder().setName('welcome').setDescription('Configure welcome messages').setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((s) => s.setName('setup').setDescription('Configure the welcome channel and message')
      .addChannelOption((o) => o.setName('channel').setDescription('Welcome channel').setRequired(true).addChannelTypes(ChannelType.GuildText))
      .addStringOption((o) => o.setName('message').setDescription('Message with placeholders')))
    .addSubcommand((s) => s.setName('enable').setDescription('Enable welcome messages'))
    .addSubcommand((s) => s.setName('disable').setDescription('Disable welcome messages'))
    .addSubcommand((s) => s.setName('message').setDescription('Change the welcome message').addStringOption((o) => o.setName('text').setDescription('Message').setRequired(true)))
    .addSubcommand((s) => s.setName('test').setDescription('Send a welcome preview for yourself')),
  requiredPermissions: [PermissionFlagsBits.ManageGuild], rateLimitCategory: 'ADMIN', guildOnly: true,
  async execute(interaction: ChatInputCommandInteraction) {
    const guildId = interaction.guildId!; const sub = interaction.options.getSubcommand();
    if (sub === 'setup') {
      const channel = interaction.options.getChannel('channel', true); const message = interaction.options.getString('message') ?? DEFAULT_WELCOME_MESSAGE;
      await guildService.updateWelcomeConfig(guildId, { channelId: channel.id, message, enabled: true });
      await interaction.reply({ embeds: [embedUtils.success('Welcome Configured', `Welcome messages will be sent to <#${channel.id}>.`)], ephemeral: true }); return;
    }
    if (sub === 'enable' || sub === 'disable') {
      await guildService.updateWelcomeConfig(guildId, { enabled: sub === 'enable' });
      await interaction.reply({ embeds: [embedUtils.success('Welcome Updated', `Welcome messages are now **${sub === 'enable' ? 'enabled' : 'disabled'}**.`)], ephemeral: true }); return;
    }
    if (sub === 'message') {
      const text = interaction.options.getString('text', true);
      await guildService.updateWelcomeConfig(guildId, { message: text });
      await interaction.reply({ embeds: [embedUtils.success('Welcome Message Updated', 'The new message has been saved.')], ephemeral: true }); return;
    }
    const member = interaction.member as GuildMember;
    const config = await guildService.getWelcomeConfig(guildId);
    if (!config.channelId) { await interaction.reply({ embeds: [embedUtils.error('Not Configured', 'Run `/welcome setup` first.')], ephemeral: true }); return; }
    const channel = interaction.guild!.channels.cache.get(config.channelId);
    if (!(channel instanceof TextChannel)) { await interaction.reply({ embeds: [embedUtils.error('Invalid Channel', 'The configured channel is missing or is not text-based.')], ephemeral: true }); return; }
    await welcomeModule.sendPreview(member, channel, config.message ?? DEFAULT_WELCOME_MESSAGE);
    await interaction.reply({ embeds: [embedUtils.success('Welcome Test Sent', `Preview sent to <#${channel.id}>.`)], ephemeral: true });
  },
};
export default command;


