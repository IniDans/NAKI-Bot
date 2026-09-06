import type { Prisma } from '@prisma/client';
import { SlashCommandBuilder, ChatInputCommandInteraction, PermissionFlagsBits } from 'discord.js';
import { db } from '../../services/database/index.js';
import { guildService } from '../../services/database/guild.service.js';
import { embedUtils } from '../../utils/embed.js';
import { validateAutoModRule } from '../../modules/automod/validation.js';
import type { Command } from '../../types/index.js';

const prisma = db.client;
const RULES = ['SPAM', 'DUPLICATE', 'MENTION_SPAM', 'MASS_PING', 'EXCESSIVE_CAPS', 'BANNED_WORDS', 'LINK_FILTER'] as const;
const ACTIONS = ['DELETE', 'WARN', 'TIMEOUT', 'MUTE', 'KICK', 'BAN', 'ADD_ROLE', 'LOG'] as const;

const command: Command = {
  data: new SlashCommandBuilder().setName('automod').setDescription('Configure AutoMod rules').setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((s) => s.setName('enable').setDescription('Enable AutoMod'))
    .addSubcommand((s) => s.setName('disable').setDescription('Disable AutoMod'))
    .addSubcommand((s) => s.setName('rule-add').setDescription('Add an AutoMod rule')
      .addStringOption((o) => o.setName('type').setDescription('Rule type').setRequired(true).addChoices(...RULES.map((value) => ({ name: value, value }))))
      .addStringOption((o) => o.setName('action').setDescription('Action').setRequired(true).addChoices(...ACTIONS.map((value) => ({ name: value, value }))))
      .addStringOption((o) => o.setName('config').setDescription('JSON rule config, e.g. {"maxMessages":5,"timeWindowSeconds":3}'))
      .addStringOption((o) => o.setName('action_config').setDescription('JSON action config, e.g. {"duration":"1m"}')))
    .addSubcommand((s) => s.setName('rule-remove').setDescription('Remove an AutoMod rule').addStringOption((o) => o.setName('id').setDescription('Rule ID').setRequired(true)))
    .addSubcommand((s) => s.setName('rule-list').setDescription('List AutoMod rules')),
  requiredPermissions: [PermissionFlagsBits.ManageGuild], rateLimitCategory: 'ADMIN', guildOnly: true,
  async execute(interaction: ChatInputCommandInteraction) {
    const guildId = interaction.guildId!; const sub = interaction.options.getSubcommand();
    if (sub === 'enable' || sub === 'disable') {
      await guildService.updateGuildConfig(guildId, { autoModEnabled: sub === 'enable' });
      await interaction.reply({ embeds: [embedUtils.success('AutoMod Updated', `AutoMod is now **${sub === 'enable' ? 'enabled' : 'disabled'}**.`)], ephemeral: true }); return;
    }
    if (sub === 'rule-list') {
      const rules = await prisma.autoModRule.findMany({ where: { guildId }, orderBy: { createdAt: 'asc' } });
      const text = rules.length ? rules.map((rule: { id: string; ruleType: string; action: string; enabled: boolean }) => `\`${rule.id}\` — **${rule.ruleType}** → ${rule.action} (${rule.enabled ? 'enabled' : 'disabled'})`).join('\n') : 'No AutoMod rules configured.';
      await interaction.reply({ embeds: [embedUtils.info('AutoMod Rules', text)], ephemeral: true }); return;
    }
    if (sub === 'rule-remove') {
      const id = interaction.options.getString('id', true); const deleted = await prisma.autoModRule.deleteMany({ where: { id, guildId } });
      await interaction.reply({ embeds: [deleted.count ? embedUtils.success('Rule Removed', `Removed rule \`${id}\`.`) : embedUtils.error('Rule Not Found', 'That rule does not exist in this server.')], ephemeral: true }); return;
    }
    const type = interaction.options.getString('type', true); const action = interaction.options.getString('action', true);
    const parseJson = (name: string): Record<string, unknown> => { const raw = interaction.options.getString(name); if (!raw) return {}; const parsed: unknown = JSON.parse(raw); if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error(`${name} must be a JSON object.`); return parsed as Record<string, unknown>; };
    let config: Record<string, unknown>; let actionConfig: Record<string, unknown>;
    try { config = parseJson('config'); actionConfig = parseJson('action_config'); validateAutoModRule({ ruleType: type, action, config, actionConfig }); } catch (error) { await interaction.reply({ embeds: [embedUtils.error('Invalid Rule', error instanceof Error ? error.message : 'Configuration must be valid JSON.')], ephemeral: true }); return; }
    const count = await prisma.autoModRule.count({ where: { guildId } }); if (count >= 100) { await interaction.reply({ embeds: [embedUtils.error('Rule Limit', 'This server already has the maximum of 100 AutoMod rules.')], ephemeral: true }); return; }
    const rule = await prisma.autoModRule.create({ data: { guildId, ruleType: type, action, config: config as Prisma.InputJsonValue, actionConfig: actionConfig as Prisma.InputJsonValue } });
    await guildService.updateGuildConfig(guildId, { autoModEnabled: true });
    await interaction.reply({ embeds: [embedUtils.success('Rule Added', `Added **${type}** → **${action}**.\nRule ID: \`${rule.id}\``)], ephemeral: true });
  },
};
export default command;



