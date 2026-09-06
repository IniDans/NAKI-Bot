import { SlashCommandBuilder, ChatInputCommandInteraction, PermissionFlagsBits } from 'discord.js';
import { guildService } from '../../services/database/guild.service.js';
import { embedUtils } from '../../utils/embed.js';
import type { Command } from '../../types/index.js';
const command: Command = {
  data: new SlashCommandBuilder().setName('antiraid').setDescription('Configure anti-raid protection').setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand((s) => s.setName('enable').setDescription('Enable anti-raid'))
    .addSubcommand((s) => s.setName('disable').setDescription('Disable anti-raid'))
    .addSubcommand((s) => s.setName('config').setDescription('Set raid thresholds').addIntegerOption((o) => o.setName('threshold').setDescription('Joins required').setMinValue(2).setMaxValue(100)).addIntegerOption((o) => o.setName('window').setDescription('Window in seconds').setMinValue(1).setMaxValue(300)).addIntegerOption((o) => o.setName('account_age').setDescription('Minimum account age in days').setMinValue(0).setMaxValue(365)))
    .addSubcommand((s) => s.setName('status').setDescription('Show anti-raid status')),
  requiredPermissions: [PermissionFlagsBits.Administrator], rateLimitCategory: 'SECURITY', guildOnly: true,
  async execute(interaction: ChatInputCommandInteraction) {
    const guild = interaction.guild!; const sub = interaction.options.getSubcommand();
    if (sub === 'enable' || sub === 'disable') { await guildService.updateSecurityConfig(guild.id, { antiRaidEnabled: sub === 'enable' }); await interaction.reply({ embeds: [embedUtils.success('Anti-Raid Updated', `Anti-raid is now **${sub === 'enable' ? 'enabled' : 'disabled'}**.`)], ephemeral: true }); return; }
    if (sub === 'status') { const c = await guildService.getSecurityConfig(guild.id); await interaction.reply({ embeds: [embedUtils.info('Anti-Raid Status', `**Enabled:** ${c.antiRaidEnabled ? 'Yes' : 'No'}\n**Threshold:** ${c.raidJoinThreshold} joins / ${c.raidTimeWindowSeconds}s\n**Minimum account age:** ${c.minimumAccountAgeDays} days\n**Lockdown:** ${c.isLockedDown ? 'Active' : 'Inactive'}`)], ephemeral: true }); return; }
    const threshold = interaction.options.getInteger('threshold'); const window = interaction.options.getInteger('window'); const age = interaction.options.getInteger('account_age'); const values: Record<string, number> = {}; if (threshold !== null) values.raidJoinThreshold = threshold; if (window !== null) values.raidTimeWindowSeconds = window; if (age !== null) values.minimumAccountAgeDays = age;
    if (!Object.keys(values).length) { await interaction.reply({ embeds: [embedUtils.error('No Changes', 'Provide at least one threshold.')], ephemeral: true }); return; }
    await guildService.updateSecurityConfig(guild.id, values); await interaction.reply({ embeds: [embedUtils.success('Anti-Raid Configured', 'Anti-raid thresholds have been saved.')], ephemeral: true });
  },
};
export default command;

