import { SlashCommandBuilder, ChatInputCommandInteraction, PermissionFlagsBits } from 'discord.js';
import { guildService } from '../../services/database/guild.service.js';
import { DefaultSecurityConfig } from '../../config/constants.js';
import { embedUtils } from '../../utils/embed.js';
import type { Command } from '../../types/index.js';

const command: Command = {
  data: new SlashCommandBuilder().setName('config').setDescription('View or reset server configuration').setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand((s) => s.setName('show').setDescription('Show a configuration summary'))
    .addSubcommand((s) => s.setName('reset').setDescription('Reset feature configuration to safe defaults')),
  requiredPermissions: [PermissionFlagsBits.Administrator], rateLimitCategory: 'ADMIN', guildOnly: true,
  async execute(interaction: ChatInputCommandInteraction) {
    const guildId = interaction.guildId!;
    if (interaction.options.getSubcommand() === 'show') {
      const [guild, log, welcome, leave, security] = await Promise.all([
        guildService.getGuildConfig(guildId), guildService.getLogConfig(guildId), guildService.getWelcomeConfig(guildId), guildService.getLeaveConfig(guildId), guildService.getSecurityConfig(guildId),
      ]);
      await interaction.reply({ embeds: [embedUtils.info('Server Configuration', `**Logging:** ${guild.loggingEnabled ? 'Enabled' : 'Disabled'}\n**AutoMod:** ${guild.autoModEnabled ? 'Enabled' : 'Disabled'}\n**Welcome:** ${welcome.enabled ? 'Enabled' : 'Disabled'}\n**Leave:** ${leave.enabled ? 'Enabled' : 'Disabled'}\n**Anti-Raid:** ${security.antiRaidEnabled ? 'Enabled' : 'Disabled'}\n**Anti-Nuke:** ${security.antiNukeEnabled ? 'Enabled' : 'Disabled'}\n**Lockdown:** ${security.isLockedDown ? 'Active' : 'Inactive'}\n\n**Configured log channels:** ${[log.memberLogChannel, log.messageLogChannel, log.moderationLogChannel, log.channelLogChannel, log.roleLogChannel, log.serverLogChannel, log.securityLogChannel].filter(Boolean).length}`)], ephemeral: true }); return;
    }
    await guildService.updateGuildConfig(guildId, { loggingEnabled: false, autoModEnabled: false, antiRaidEnabled: false, antiNukeEnabled: false, welcomeEnabled: false, leaveEnabled: false, muteRoleId: null });
    await guildService.updateLogConfig(guildId, { memberLogChannel: null, messageLogChannel: null, moderationLogChannel: null, channelLogChannel: null, roleLogChannel: null, serverLogChannel: null, securityLogChannel: null });
    await guildService.updateWelcomeConfig(guildId, { enabled: false, channelId: null, message: null, embedData: null, color: null, imageUrl: null });
    await guildService.updateLeaveConfig(guildId, { enabled: false, channelId: null, message: null });
    await guildService.updateSecurityConfig(guildId, { ...DefaultSecurityConfig, antiRaidEnabled: false, antiNukeEnabled: false, isLockedDown: false, lockdownStarted: null, lockdownEndsAt: null });
    await interaction.reply({ embeds: [embedUtils.success('Configuration Reset', 'Feature configuration has been reset. AutoMod rules, templates, warnings, and audit history were preserved.')], ephemeral: true });
  },
};
export default command;
