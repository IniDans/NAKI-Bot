import { SlashCommandBuilder, ChatInputCommandInteraction, PermissionFlagsBits } from 'discord.js';
import { guildService } from '../../services/database/guild.service.js';
import { DefaultSecurityConfig } from '../../config/constants.js';
import { embedUtils } from '../../utils/embed.js';
import type { Command } from '../../types/index.js';

const command: Command = {
  data: new SlashCommandBuilder().setName('antinuke').setDescription('Configure anti-nuke protection').setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand((s) => s.setName('enable').setDescription('Enable anti-nuke'))
    .addSubcommand((s) => s.setName('disable').setDescription('Disable anti-nuke'))
    .addSubcommand((s) => s.setName('config').setDescription('Set anti-nuke thresholds')
      .addIntegerOption((o) => o.setName('channel_delete').setDescription('Channel deletes').setMinValue(1).setMaxValue(100))
      .addIntegerOption((o) => o.setName('role_delete').setDescription('Role deletes').setMinValue(1).setMaxValue(100))
      .addIntegerOption((o) => o.setName('ban').setDescription('Bans').setMinValue(1).setMaxValue(100))
      .addIntegerOption((o) => o.setName('kick').setDescription('Kicks').setMinValue(1).setMaxValue(100))
      .addIntegerOption((o) => o.setName('window').setDescription('Action window in seconds').setMinValue(1).setMaxValue(300)))
    .addSubcommand((s) => s.setName('status').setDescription('Show anti-nuke status'))
    .addSubcommand((s) => s.setName('whitelist').setDescription('Use /security whitelist commands')),
  requiredPermissions: [PermissionFlagsBits.Administrator], rateLimitCategory: 'SECURITY', guildOnly: true,
  async execute(interaction: ChatInputCommandInteraction) {
    const guildId = interaction.guildId!; const sub = interaction.options.getSubcommand();
    if (sub === 'enable' || sub === 'disable') { await guildService.updateSecurityConfig(guildId, { antiNukeEnabled: sub === 'enable' }); await interaction.reply({ embeds: [embedUtils.success('Anti-Nuke Updated', `Anti-nuke is now **${sub === 'enable' ? 'enabled' : 'disabled'}**.`)], ephemeral: true }); return; }
    if (sub === 'status') { const c = await guildService.getSecurityConfig(guildId); await interaction.reply({ embeds: [embedUtils.info('Anti-Nuke Status', `**Enabled:** ${c.antiNukeEnabled ? 'Yes' : 'No'}\n**Channel deletes:** ${c.channelDeleteThreshold}\n**Role deletes:** ${c.roleDeleteThreshold}\n**Bans:** ${c.banThreshold}\n**Kicks:** ${c.kickThreshold}\n**Window:** ${c.actionWindowSeconds}s`)], ephemeral: true }); return; }
    if (sub === 'whitelist') { await interaction.reply({ embeds: [embedUtils.info('Whitelist', 'Use `/security whitelist-add`, `/security whitelist-remove`, or `/security whitelist-list`.')], ephemeral: true }); return; }
    const values: Record<string, number> = {}; const map: Record<string, string> = { channel_delete: 'channelDeleteThreshold', role_delete: 'roleDeleteThreshold', ban: 'banThreshold', kick: 'kickThreshold', window: 'actionWindowSeconds' };
    for (const [option, field] of Object.entries(map)) { const value = interaction.options.getInteger(option); if (value !== null) values[field] = value; }
    if (!Object.keys(values).length) { await interaction.reply({ embeds: [embedUtils.error('No Changes', `Provide a threshold to update. Defaults: ${DefaultSecurityConfig.channelDeleteThreshold} channel deletes, ${DefaultSecurityConfig.roleDeleteThreshold} role deletes.`)], ephemeral: true }); return; }
    await guildService.updateSecurityConfig(guildId, values); await interaction.reply({ embeds: [embedUtils.success('Anti-Nuke Configured', 'Anti-nuke thresholds have been saved.')], ephemeral: true });
  },
};
export default command;

