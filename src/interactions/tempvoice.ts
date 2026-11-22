import {
  ActionRowBuilder,
  MessageFlags,
  ModalBuilder,
  OverwriteType,
  StringSelectMenuBuilder,
  TextInputBuilder,
  TextInputStyle,
  UserSelectMenuBuilder,
  type EmbedBuilder,
  type GuildMember,
  type VoiceBasedChannel,
} from 'discord.js';
import { tempVoiceModule } from '../modules/tempvoice/index.js';
import { checkClaim, cleanRoomName, parseUserLimit, MAX_USER_LIMIT } from '../modules/tempvoice/logic.js';
import { readRoomState, refreshPanel } from '../modules/tempvoice/panel.js';
import { embedUtils } from '../utils/embed.js';
import type { ComponentHandler, ComponentInteraction } from '../types/index.js';

/**
 * Temporary voice room panel. Every id is `tv:<action>:<channelId>`.
 *
 * Panel:   name, limit, chat, privacy (select), trust, untrust, invite, kick, claim, transfer
 * Modals:  name-set, limit-set
 * Pickers: trust-pick, invite-pick (user selects), untrust-pick, kick-pick, transfer-pick (lists)
 *
 * Only the owner may use it, except Claim, which is for the others once the owner has left.
 */

const TRUSTED_PERMS = { ViewChannel: true, Connect: true, SendMessages: true } as const;
const KICKED_PERMS = { Connect: false } as const;
const MAX_PICK = 10;
const RENAME_WAIT_MS = 5000;

type GuildInteraction = ComponentInteraction & { guildId: string };

const ephemeral = (embed: EmbedBuilder) => ({ embeds: [embed], flags: MessageFlags.Ephemeral as const });

function otherMembers(channel: VoiceBasedChannel, ownerId: string): GuildMember[] {
  return [...channel.members.values()].filter((m) => !m.user.bot && m.id !== ownerId);
}

function memberLabel(member: GuildMember | undefined, id: string): string {
  return (member?.displayName ?? id).slice(0, 100);
}

/** Ephemeral reply holding a picker for a follow-up action. */
async function showPicker(interaction: GuildInteraction, title: string, picker: UserSelectMenuBuilder | StringSelectMenuBuilder) {
  if (!interaction.isRepliable()) return;
  await interaction.reply({
    embeds: [embedUtils.info(title)],
    components: [new ActionRowBuilder<UserSelectMenuBuilder | StringSelectMenuBuilder>().addComponents(picker)],
    flags: MessageFlags.Ephemeral,
  });
}

function memberList(customId: string, placeholder: string, members: { id: string; label: string; description?: string }[], max: number) {
  return new StringSelectMenuBuilder()
    .setCustomId(customId)
    .setPlaceholder(placeholder)
    .setMinValues(1)
    .setMaxValues(Math.min(max, members.length))
    .addOptions(members.slice(0, 25).map((m) => ({ label: m.label, value: m.id, ...(m.description ? { description: m.description } : {}) })));
}

async function updatePanel(channel: VoiceBasedChannel): Promise<void> {
  const ownerId = tempVoiceModule.ownerOf(channel.id);
  if (ownerId) await refreshPanel(channel, ownerId);
}

/** Finish a picker: replace the ephemeral picker with the result and refresh the panel. */
async function finishPick(interaction: GuildInteraction, channel: VoiceBasedChannel, result: EmbedBuilder) {
  await updatePanel(channel);
  if (interaction.isMessageComponent()) await interaction.editReply({ embeds: [result], components: [] });
}

async function claim(interaction: GuildInteraction, channel: VoiceBasedChannel, ownerId: string) {
  if (!interaction.isRepliable()) return;
  const verdict = checkClaim({ ownerId, claimerId: interaction.user.id, memberIds: [...channel.members.keys()] });
  const refusals = {
    'already-owner': embedUtils.info('Already Yours', 'You already own this room.'),
    'not-in-room': embedUtils.warning('Join First', `Join <#${channel.id}> to claim it.`),
    'owner-present': embedUtils.warning('Owner Is Here', `<@${ownerId}> is still in the room. You can claim it once they leave.`),
  } as const;
  if (verdict !== 'ok') {
    await interaction.reply(ephemeral(refusals[verdict]));
    return;
  }
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  await tempVoiceModule.setOwner(channel, interaction.user.id, `Room claimed by ${interaction.user.tag}`);
  await updatePanel(channel);
  await channel.send({ content: `👑 <@${interaction.user.id}> claimed the room.`, allowedMentions: { parse: [] } });
  await interaction.editReply({ embeds: [embedUtils.success('Room Claimed', 'You own this room now.')] });
}

const handler: ComponentHandler = {
  prefix: 'tv',
  async execute(rawInteraction, [action, channelId]) {
    if (!rawInteraction.inCachedGuild()) return;
    const interaction = rawInteraction as GuildInteraction & typeof rawInteraction;
    const channel = interaction.guild.channels.cache.get(channelId ?? '');
    const ownerId = channelId ? tempVoiceModule.ownerOf(channelId) : null;
    if (!channel?.isVoiceBased() || !ownerId) {
      await interaction.reply(ephemeral(embedUtils.warning('Room Closed', 'This voice room no longer exists.')));
      return;
    }

    if (action === 'claim') {
      await claim(interaction, channel, ownerId);
      return;
    }

    if (interaction.user.id !== ownerId) {
      const away = !channel.members.has(ownerId);
      await interaction.reply(
        ephemeral(
          embedUtils.error(
            'Owner Only',
            `Only <@${ownerId}> can use these controls.${away ? ' They have left the room, so you can press **Claim** to take over.' : ''}`,
          ),
        ),
      );
      return;
    }

    const reason = `Voice room owner ${interaction.user.tag}`;
    const everyone = interaction.guild.roles.everyone;

    switch (action) {
      // ── Name and limit (modals) ─────────────────────────────────────────
      case 'name': {
        if (!interaction.isButton()) return;
        const input = new TextInputBuilder()
          .setCustomId('name')
          .setLabel('Room name')
          .setStyle(TextInputStyle.Short)
          .setMaxLength(100)
          .setValue(channel.name)
          .setRequired(true);
        await interaction.showModal(
          new ModalBuilder()
            .setCustomId(`tv:name-set:${channel.id}`)
            .setTitle('Rename your room')
            .addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(input)),
        );
        return;
      }
      case 'name-set': {
        if (!interaction.isModalSubmit()) return;
        const name = cleanRoomName(interaction.fields.getTextInputValue('name'));
        if (!name) {
          await interaction.reply(ephemeral(embedUtils.error('Invalid Name', 'The name cannot be empty.')));
          return;
        }
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        // Discord allows two renames per channel every ten minutes; a third waits in discord.js's queue.
        const renamed = await Promise.race([
          channel.setName(name, reason).then(() => true),
          new Promise<false>((resolve) => setTimeout(() => resolve(false), RENAME_WAIT_MS)),
        ]);
        await interaction.editReply({
          embeds: [
            renamed
              ? embedUtils.success('Room Renamed', `Your room is now **${name}**.`)
              : embedUtils.warning('Rename Queued', 'Discord only allows 2 renames every 10 minutes. The new name will apply as soon as it allows.'),
          ],
        });
        return;
      }
      case 'limit': {
        if (!interaction.isButton()) return;
        const input = new TextInputBuilder()
          .setCustomId('limit')
          .setLabel(`User limit (0-${MAX_USER_LIMIT}, 0 = no limit)`)
          .setStyle(TextInputStyle.Short)
          .setMaxLength(2)
          .setValue(String(channel.userLimit))
          .setRequired(false);
        await interaction.showModal(
          new ModalBuilder()
            .setCustomId(`tv:limit-set:${channel.id}`)
            .setTitle('Set the user limit')
            .addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(input)),
        );
        return;
      }
      case 'limit-set': {
        if (!interaction.isModalSubmit()) return;
        const limit = parseUserLimit(interaction.fields.getTextInputValue('limit'));
        if (limit === null) {
          await interaction.reply(ephemeral(embedUtils.error('Invalid Limit', `Enter a number from 0 to ${MAX_USER_LIMIT}.`)));
          return;
        }
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        await channel.setUserLimit(limit, reason);
        await updatePanel(channel);
        await interaction.editReply({
          embeds: [embedUtils.success('Limit Updated', limit ? `Up to **${limit}** people can join.` : 'The room has no user limit now.')],
        });
        return;
      }

      // ── Privacy and chat ────────────────────────────────────────────────
      case 'privacy': {
        if (!interaction.isStringSelectMenu()) return;
        const choice = interaction.values[0];
        const changes = {
          lock: { perms: { Connect: false }, text: '🔒 Locked. Only trusted members can join.' },
          unlock: { perms: { Connect: null }, text: '🔓 Unlocked. Anyone can join.' },
          hide: { perms: { ViewChannel: false }, text: '🙈 Hidden. Only trusted members can see the room.' },
          show: { perms: { ViewChannel: null }, text: '👁️ Visible to everyone.' },
        } as const;
        const change = changes[choice as keyof typeof changes];
        if (!change) return;
        await interaction.deferUpdate();
        await channel.permissionOverwrites.edit(everyone, change.perms, { reason });
        await updatePanel(channel);
        await interaction.followUp(ephemeral(embedUtils.success('Privacy Updated', change.text)));
        return;
      }
      case 'chat': {
        if (!interaction.isButton()) return;
        const chatOff = readRoomState(channel, ownerId).chatOff;
        await interaction.deferUpdate();
        await channel.permissionOverwrites.edit(everyone, { SendMessages: chatOff ? null : false }, { reason });
        await updatePanel(channel);
        await interaction.followUp(
          ephemeral(
            embedUtils.success(
              'Chat Updated',
              chatOff ? '💬 Everyone in the room can chat again.' : '🔇 Only you and trusted members can chat now.',
            ),
          ),
        );
        return;
      }

      // ── Pickers ─────────────────────────────────────────────────────────
      case 'trust':
      case 'invite': {
        const picker = new UserSelectMenuBuilder()
          .setCustomId(`tv:${action}-pick:${channel.id}`)
          .setPlaceholder(action === 'trust' ? 'Choose members to trust' : 'Choose members to invite')
          .setMinValues(1)
          .setMaxValues(MAX_PICK);
        await showPicker(
          interaction,
          action === 'trust' ? 'Trusted members can join and see the room even when it is locked or hidden.' : 'Invited members get access and a DM with a link to the room.',
          picker,
        );
        return;
      }
      case 'untrust': {
        const state = readRoomState(channel, ownerId);
        const ids = [...state.trusted, ...state.blocked];
        if (!ids.length) {
          await interaction.reply(ephemeral(embedUtils.info('Nobody To Remove', 'No one is trusted or kicked in this room.')));
          return;
        }
        const options = ids.map((id) => ({
          id,
          label: memberLabel(interaction.guild.members.cache.get(id), id),
          description: state.blocked.includes(id) ? 'Kicked: allow them back in' : 'Trusted',
        }));
        await showPicker(interaction, 'Remove trust or let kicked members back in.', memberList(`tv:untrust-pick:${channel.id}`, 'Choose members', options, MAX_PICK));
        return;
      }
      case 'kick':
      case 'transfer': {
        const members = otherMembers(channel, ownerId);
        if (!members.length) {
          await interaction.reply(ephemeral(embedUtils.info('Nobody Here', 'There is no one else in your room.')));
          return;
        }
        const options = members.map((m) => ({ id: m.id, label: memberLabel(m, m.id) }));
        await showPicker(
          interaction,
          action === 'kick' ? 'Kicked members are disconnected and cannot rejoin while the room exists.' : 'The new owner gets the controls and you lose them.',
          memberList(`tv:${action}-pick:${channel.id}`, action === 'kick' ? 'Choose members to kick' : 'Choose the new owner', options, action === 'kick' ? MAX_PICK : 1),
        );
        return;
      }

      // ── Picker results ──────────────────────────────────────────────────
      case 'trust-pick':
      case 'invite-pick': {
        if (!interaction.isUserSelectMenu()) return;
        await interaction.deferUpdate();
        const users = [...interaction.users.values()].filter((u) => !u.bot && u.id !== ownerId);
        if (!users.length) {
          await interaction.editReply({ embeds: [embedUtils.warning('Nobody Added', 'Bots and yourself cannot be chosen.')], components: [] });
          return;
        }
        for (const user of users) {
          await channel.permissionOverwrites.create(user.id, TRUSTED_PERMS, { reason, type: OverwriteType.Member });
        }
        const mentions = users.map((u) => `<@${u.id}>`).join(', ');
        if (action === 'trust-pick') {
          await finishPick(interaction, channel, embedUtils.success('Members Trusted', `${mentions} can now join and see your room.`));
          return;
        }
        let failed = 0;
        for (const user of users) {
          await user
            .send({
              embeds: [
                embedUtils.info(
                  'Voice Room Invite',
                  `**${interaction.member.displayName}** invited you to **${channel.name}** in **${interaction.guild.name}**.\n${channel.url}`,
                ),
              ],
            })
            .catch(() => failed++);
        }
        const note = failed ? `\n${failed} of them have DMs closed, so they only got the access.` : '';
        await finishPick(interaction, channel, embedUtils.success('Members Invited', `Invited ${mentions}.${note}`));
        return;
      }
      case 'untrust-pick': {
        if (!interaction.isStringSelectMenu()) return;
        await interaction.deferUpdate();
        const ids = interaction.values.filter((id) => id !== ownerId && id !== interaction.client.user.id);
        for (const id of ids) await channel.permissionOverwrites.delete(id, reason).catch(() => undefined);
        await finishPick(interaction, channel, embedUtils.success('Access Removed', `Removed the room permissions of ${ids.map((id) => `<@${id}>`).join(', ')}.`));
        return;
      }
      case 'kick-pick': {
        if (!interaction.isStringSelectMenu()) return;
        await interaction.deferUpdate();
        const ids = interaction.values.filter((id) => id !== ownerId && id !== interaction.client.user.id);
        for (const id of ids) {
          await channel.permissionOverwrites.create(id, KICKED_PERMS, { reason, type: OverwriteType.Member });
          const member = channel.members.get(id);
          if (member) await member.voice.disconnect(reason).catch(() => undefined);
        }
        await finishPick(interaction, channel, embedUtils.success('Members Kicked', `Kicked ${ids.map((id) => `<@${id}>`).join(', ')}. Use **Untrust** to let them back in.`));
        return;
      }
      case 'transfer-pick': {
        if (!interaction.isStringSelectMenu()) return;
        const newOwnerId = interaction.values[0];
        if (!newOwnerId || !channel.members.has(newOwnerId)) {
          await interaction.update({ embeds: [embedUtils.warning('Not In Room', 'That member has left the room.')], components: [] });
          return;
        }
        await interaction.deferUpdate();
        await tempVoiceModule.setOwner(channel, newOwnerId, `Room handed over by ${interaction.user.tag}`);
        await channel.send({ content: `🔁 <@${interaction.user.id}> handed the room over to <@${newOwnerId}>.`, allowedMentions: { parse: [] } });
        await finishPick(interaction, channel, embedUtils.success('Room Transferred', `<@${newOwnerId}> owns the room now.`));
        return;
      }
    }
  },
};

export default handler;
