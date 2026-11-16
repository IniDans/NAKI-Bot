import type { Role } from 'discord.js';
import { db } from '../services/database/index.js';
import { buttonChange, parseOptions, selectChange } from '../modules/rolepanels/logic.js';
import { embedUtils } from '../utils/embed.js';
import { appLogger } from '../utils/logger.js';
import type { ComponentHandler } from '../types/index.js';

/**
 * rolepanel:b:<panelId>:<roleId>  button on a panel posted from the dashboard
 * rolepanel:s:<panelId>           select menu on a panel; the values are role IDs
 */
const handler: ComponentHandler = {
  prefix: 'rolepanel',
  async execute(interaction, [kind, panelId, roleId]) {
    if (!interaction.inCachedGuild() || interaction.isModalSubmit()) return;
    await interaction.deferReply({ ephemeral: true });

    const panel = await db.client.rolePanel.findFirst({ where: { id: panelId, guildId: interaction.guildId } });
    if (!panel) {
      await interaction.editReply({ embeds: [embedUtils.warning('Panel Removed', 'This role panel no longer exists.')] });
      return;
    }

    // Only roles the bot can still hand out; a deleted or too-high role is skipped instead of failing the whole click.
    const usable = new Map<string, Role>();
    for (const option of parseOptions(panel.options)) {
      const role = interaction.guild.roles.cache.get(option.roleId);
      if (role && role.editable && !role.managed) usable.set(role.id, role);
    }
    const panelRoles = [...usable.keys()];
    const member = interaction.member;
    const has = (id: string) => member.roles.cache.has(id);

    let change;
    if (kind === 'b' && interaction.isButton()) {
      if (!usable.has(roleId)) {
        await interaction.editReply({
          embeds: [embedUtils.error('Role Unavailable', 'NAKI can no longer give this role. Let the moderators know.')],
        });
        return;
      }
      change = buttonChange(has, panelRoles, roleId, panel.exclusive);
    } else if (kind === 's' && interaction.isStringSelectMenu()) {
      change = selectChange(has, panelRoles, interaction.values, panel.exclusive);
    } else {
      return;
    }

    if (change.add.length === 0 && change.remove.length === 0) {
      await interaction.editReply({ embeds: [embedUtils.info('No Change', 'Your roles already match.')] });
      return;
    }

    try {
      if (change.remove.length) await member.roles.remove(change.remove, 'Role panel');
      if (change.add.length) await member.roles.add(change.add, 'Role panel');
    } catch (error) {
      appLogger.warn('Role panel update failed', 'RolePanel', {
        guildId: interaction.guildId,
        panelId,
        error: error instanceof Error ? error.message : String(error),
      });
      await interaction.editReply({
        embeds: [embedUtils.error('Not Updated', 'NAKI could not change your roles. Its role may be below these roles.')],
      });
      return;
    }

    const lines = [
      change.add.length ? `Added: ${change.add.map((id) => `<@&${id}>`).join(', ')}` : '',
      change.remove.length ? `Removed: ${change.remove.map((id) => `<@&${id}>`).join(', ')}` : '',
    ].filter(Boolean);
    await interaction.editReply({ embeds: [embedUtils.success('Roles Updated', lines.join('\n'))] });
  },
};

export default handler;
