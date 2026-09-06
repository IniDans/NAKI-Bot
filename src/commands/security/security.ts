import { SlashCommandBuilder, ChatInputCommandInteraction, PermissionFlagsBits } from 'discord.js';
import { db } from '../../services/database/index.js';
import { guildService } from '../../services/database/guild.service.js';
import { antiraidModule } from '../../modules/antiraid/index.js';
import { embedUtils } from '../../utils/embed.js';
import type { Command } from '../../types/index.js';

const prisma = db.client;
const command: Command = {
  data: new SlashCommandBuilder().setName('security').setDescription('Manage server security').setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand((s) => s.setName('status').setDescription('Show security status'))
    .addSubcommand((s) => s.setName('lockdown').setDescription('Lock text channels'))
    .addSubcommand((s) => s.setName('unlock').setDescription('Unlock text channels'))
    .addSubcommand((s) => s.setName('whitelist-add').setDescription('Whitelist a security administrator').addUserOption((o) => o.setName('user').setDescription('User').setRequired(true)).addStringOption((o) => o.setName('reason').setDescription('Reason')))
    .addSubcommand((s) => s.setName('whitelist-remove').setDescription('Remove a user from the whitelist').addUserOption((o) => o.setName('user').setDescription('User').setRequired(true)))
    .addSubcommand((s) => s.setName('whitelist-list').setDescription('List whitelisted users'))
    .addSubcommand((s) => s.setName('config').setDescription('Configure security thresholds')
      .addBooleanOption((o) => o.setName('antiraid').setDescription('Enable anti-raid'))
      .addBooleanOption((o) => o.setName('antinuke').setDescription('Enable anti-nuke'))
      .addIntegerOption((o) => o.setName('raid_threshold').setDescription('Joins during the raid window').setMinValue(2).setMaxValue(100))
      .addIntegerOption((o) => o.setName('raid_window').setDescription('Raid window in seconds').setMinValue(1).setMaxValue(300))
      .addIntegerOption((o) => o.setName('action_window').setDescription('Anti-nuke action window').setMinValue(1).setMaxValue(300))),
  requiredPermissions: [PermissionFlagsBits.Administrator], rateLimitCategory: 'SECURITY', guildOnly: true,
  async execute(interaction: ChatInputCommandInteraction) {
    const guild = interaction.guild!; const sub = interaction.options.getSubcommand();
    if (sub === 'status') {
      const c = await guildService.getSecurityConfig(guild.id); const list = await prisma.securityWhitelist.count({ where: { guildId: guild.id } });
      await interaction.reply({ embeds: [embedUtils.info('Security Status', `**Anti-Raid:** ${c.antiRaidEnabled ? 'Enabled' : 'Disabled'}\n**Anti-Nuke:** ${c.antiNukeEnabled ? 'Enabled' : 'Disabled'}\n**Lockdown:** ${c.isLockedDown ? 'Active' : 'Inactive'}\n**Whitelist entries:** ${list}\n**Raid threshold:** ${c.raidJoinThreshold} joins / ${c.raidTimeWindowSeconds}s\n**Action window:** ${c.actionWindowSeconds}s`)], ephemeral: true }); return;
    }
    if (sub === 'lockdown' || sub === 'unlock') {
      if (sub === 'lockdown') await antiraidModule.lockdown(guild, `Manual lockdown by ${interaction.user.tag}`); else await antiraidModule.unlock(guild, `Manual unlock by ${interaction.user.tag}`);
      await interaction.reply({ embeds: [embedUtils.success('Security Updated', `Lockdown is now **${sub === 'lockdown' ? 'active' : 'inactive'}**.`)], ephemeral: true }); return;
    }
    if (sub === 'whitelist-add' || sub === 'whitelist-remove') {
      const user = interaction.options.getUser('user', true); if (user.id === guild.ownerId) { await interaction.reply({ embeds: [embedUtils.error('Invalid User', 'The server owner is protected automatically.')], ephemeral: true }); return; }
      if (sub === 'whitelist-add') await prisma.securityWhitelist.upsert({ where: { guildId_userId: { guildId: guild.id, userId: user.id } }, update: { reason: interaction.options.getString('reason') }, create: { guildId: guild.id, userId: user.id, addedById: interaction.user.id, reason: interaction.options.getString('reason') } });
      else await prisma.securityWhitelist.deleteMany({ where: { guildId: guild.id, userId: user.id } });
      await interaction.reply({ embeds: [embedUtils.success('Whitelist Updated', `${user.tag} was ${sub === 'whitelist-add' ? 'added to' : 'removed from'} the security whitelist.`)], ephemeral: true }); return;
    }
    if (sub === 'whitelist-list') {
      const entries = await prisma.securityWhitelist.findMany({ where: { guildId: guild.id }, orderBy: { createdAt: 'asc' } });
      await interaction.reply({ embeds: [embedUtils.info('Security Whitelist', entries.length ? entries.map((entry: { userId: string; reason: string | null }) => `<@${entry.userId}> — ${entry.reason ?? 'No reason'}`).join('\n') : 'No users are whitelisted.')], ephemeral: true }); return;
    }
    const values: Record<string, unknown> = {};
    const antiRaid = interaction.options.getBoolean('antiraid'); const antiNuke = interaction.options.getBoolean('antinuke'); const raidThreshold = interaction.options.getInteger('raid_threshold'); const raidWindow = interaction.options.getInteger('raid_window'); const actionWindow = interaction.options.getInteger('action_window');
    if (antiRaid !== null) values.antiRaidEnabled = antiRaid; if (antiNuke !== null) values.antiNukeEnabled = antiNuke; if (raidThreshold !== null) values.raidJoinThreshold = raidThreshold; if (raidWindow !== null) values.raidTimeWindowSeconds = raidWindow; if (actionWindow !== null) values.actionWindowSeconds = actionWindow;
    if (!Object.keys(values).length) { await interaction.reply({ embeds: [embedUtils.error('No Changes', 'Provide at least one configuration value.')], ephemeral: true }); return; }
    await guildService.updateSecurityConfig(guild.id, values); await interaction.reply({ embeds: [embedUtils.success('Security Configured', 'Security settings have been saved.')], ephemeral: true });
  },
};
export default command;


