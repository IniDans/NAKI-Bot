import { Events, ChatInputCommandInteraction, AutocompleteInteraction, GuildMember } from 'discord.js';
import { appLogger } from '../../utils/logger.js';
import { rateLimiter } from '../../utils/rateLimiter.js';
import { embedUtils } from '../../utils/embed.js';
import { permissionService } from '../../services/permissions/index.js';
import type { Event, Command } from '../../types/index.js';

const event: Event = {
  name: Events.InteractionCreate,
  async execute(interaction: unknown) {
    if ((interaction as AutocompleteInteraction).isAutocomplete?.()) {
      const autocompleteInteraction = interaction as AutocompleteInteraction;
      const command = autocompleteInteraction.client.commands.get(autocompleteInteraction.commandName);
      if (command?.autocomplete) {
        try { await command.autocomplete(autocompleteInteraction); } catch (error) {
          appLogger.error('Autocomplete error', 'InteractionHandler', { command: autocompleteInteraction.commandName, error: error instanceof Error ? error.message : String(error) });
        }
      }
      return;
    }
    if (!(interaction as ChatInputCommandInteraction).isChatInputCommand?.()) return;
    const chatInteraction = interaction as ChatInputCommandInteraction;
    const command: Command | undefined = chatInteraction.client.commands.get(chatInteraction.commandName);
    if (!command) return;
    if (command.guildOnly !== false && !chatInteraction.guild) {
      await chatInteraction.reply({ embeds: [embedUtils.error('Server Only', 'This command can only be used in a server.')], ephemeral: true });
      return;
    }
    if (chatInteraction.guild && chatInteraction.member instanceof GuildMember && command.requiredPermissions?.length) {
      const userCheck = permissionService.checkUserPermission(chatInteraction.member, command.requiredPermissions);
      if (!userCheck.allowed) {
        await chatInteraction.reply({ embeds: [embedUtils.error('Permission Denied', userCheck.reason!)], ephemeral: true });
        return;
      }
    }
    if (chatInteraction.guild && command.requiredBotPermissions?.length) {
      const botCheck = permissionService.checkBotPermission(chatInteraction.guild, command.requiredBotPermissions);
      if (!botCheck.allowed) {
        await chatInteraction.reply({ embeds: [embedUtils.error('Bot Permission Missing', botCheck.reason!)], ephemeral: true });
        return;
      }
    }
    const category = command.rateLimitCategory ?? 'DEFAULT';
    const cooldown = rateLimiter.check(chatInteraction.user.id, chatInteraction.commandName, category);
    if (cooldown > 0) {
      await chatInteraction.reply({ embeds: [embedUtils.warning('Rate Limited', `Please wait **${Math.ceil(cooldown / 1000)}** second(s).`)], ephemeral: true });
      return;
    }
    try {
      appLogger.command(chatInteraction.commandName, chatInteraction.user.id, chatInteraction.guildId, {
        subcommand: chatInteraction.options.getSubcommand(false) ?? undefined,
        subcommandGroup: chatInteraction.options.getSubcommandGroup(false) ?? undefined,
      });
      await command.execute(chatInteraction);
    } catch (error) {
      appLogger.error(`Command execution failed: /${chatInteraction.commandName}`, 'InteractionHandler', { error: error instanceof Error ? error.message : String(error), stack: error instanceof Error ? error.stack : undefined, userId: chatInteraction.user.id, guildId: chatInteraction.guildId });
      const response = { embeds: [embedUtils.error('Command Error', 'An unexpected error occurred. The error has been logged.')], ephemeral: true };
      try { if (chatInteraction.replied || chatInteraction.deferred) await chatInteraction.followUp(response); else await chatInteraction.reply(response); } catch { /* interaction expired */ }
    }
  },
};
export default event;
