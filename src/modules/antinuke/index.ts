import { AuditLogEvent, Client, Guild, PermissionFlagsBits } from 'discord.js';
import { db } from '../../services/database/index.js';
import { guildService } from '../../services/database/guild.service.js';
import { permissionService } from '../../services/permissions/index.js';
import { logModule } from '../logger/index.js';
import { Colors, LogCategory, SecurityIncidentType, ThreatLevel } from '../../config/constants.js';
import { appLogger } from '../../utils/logger.js';

const prisma = db.client;
const actionWindows = new Map<string, number[]>();
const AUDIT_TYPES: Record<string, AuditLogEvent> = {
  CHANNEL_CREATE: AuditLogEvent.ChannelCreate,
  CHANNEL_DELETE: AuditLogEvent.ChannelDelete,
  ROLE_CREATE: AuditLogEvent.RoleCreate,
  ROLE_DELETE: AuditLogEvent.RoleDelete,
  MEMBER_BAN: AuditLogEvent.MemberBanAdd,
  MEMBER_KICK: AuditLogEvent.MemberKick,
  MEMBER_TIMEOUT: AuditLogEvent.MemberUpdate,
  CHANNEL_PERMISSION_CHANGE: AuditLogEvent.ChannelOverwriteCreate,
  ROLE_PERMISSION_CHANGE: AuditLogEvent.RoleUpdate,
};
const THRESHOLD_FIELDS: Record<string, keyof Awaited<ReturnType<typeof guildService.getSecurityConfig>>> = {
  CHANNEL_CREATE: 'channelCreateThreshold',
  CHANNEL_DELETE: 'channelDeleteThreshold',
  ROLE_CREATE: 'roleCreateThreshold',
  ROLE_DELETE: 'roleDeleteThreshold',
  MEMBER_BAN: 'banThreshold',
  MEMBER_KICK: 'kickThreshold',
  MEMBER_TIMEOUT: 'timeoutThreshold',
  CHANNEL_PERMISSION_CHANGE: 'channelDeleteThreshold',
  ROLE_PERMISSION_CHANGE: 'roleDeleteThreshold',
};
const INCIDENT_TYPES: Record<string, SecurityIncidentType> = {
  CHANNEL_CREATE: SecurityIncidentType.MASS_CHANNEL_CREATE,
  CHANNEL_DELETE: SecurityIncidentType.MASS_CHANNEL_DELETE,
  ROLE_CREATE: SecurityIncidentType.MASS_ROLE_CREATE,
  ROLE_DELETE: SecurityIncidentType.MASS_ROLE_DELETE,
  MEMBER_BAN: SecurityIncidentType.MASS_BAN,
  MEMBER_KICK: SecurityIncidentType.MASS_KICK,
  MEMBER_TIMEOUT: SecurityIncidentType.MASS_TIMEOUT,
  CHANNEL_PERMISSION_CHANGE: SecurityIncidentType.PERMISSION_CHANGE,
  ROLE_PERMISSION_CHANGE: SecurityIncidentType.PERMISSION_CHANGE,
};

async function findExecutor(guild: Guild, action: string, targetId: string): Promise<{ id: string; tag: string } | null> {
  const type = AUDIT_TYPES[action];
  if (!type) return null;
  try {
    const logs = await guild.fetchAuditLogs({ type, limit: 5 });
    const entry = logs.entries.find((candidate) => {
      const target = candidate.target as { id?: string } | null;
      return (!targetId || target?.id === targetId) && candidate.createdTimestamp > Date.now() - 10_000;
    });
    if (!entry?.executor || !entry.executor.tag) return null;
    return { id: entry.executor.id, tag: entry.executor.tag };
  } catch (error) {
    appLogger.warn('Unable to inspect audit logs for anti-nuke', 'AntiNuke', {
      guildId: guild.id,
      action,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

export const antinukeModule = {
  async trackAction(client: Client, guildId: string, action: string, targetId: string): Promise<void> {
    const guild = client.guilds.cache.get(guildId);
    if (!guild) return;
    const config = await guildService.getSecurityConfig(guildId);
    if (!config.antiNukeEnabled) return;

    const executor = await findExecutor(guild, action, targetId);
    if (!executor || executor.id === guild.ownerId || executor.id === client.user?.id) return;
    if (await permissionService.isWhitelisted(guildId, executor.id)) return;

    const thresholdField = THRESHOLD_FIELDS[action];
    const incidentType = INCIDENT_TYPES[action];
    if (!thresholdField || !incidentType) return;
    const threshold = Number(config[thresholdField]);
    const key = `${guildId}:${executor.id}:${action}`;
    const cutoff = Date.now() - config.actionWindowSeconds * 1000;
    const timestamps = (actionWindows.get(key) ?? []).filter((timestamp) => timestamp >= cutoff);
    timestamps.push(Date.now());
    actionWindows.set(key, timestamps);
    if (timestamps.length < threshold) return;

    const existing = await prisma.securityIncident.findFirst({
      where: { guildId, executorId: executor.id, type: incidentType, resolved: false, createdAt: { gte: new Date(cutoff) } },
    });
    if (existing) return;

    const incident = await prisma.securityIncident.create({
      data: {
        guildId,
        type: incidentType,
        executorId: executor.id,
        actionCount: timestamps.length,
        threshold,
        threatLevel: timestamps.length >= threshold * 2 ? ThreatLevel.CRITICAL : ThreatLevel.HIGH,
        actionsTaken: ['ALERT'],
        details: { targetId, actionWindowSeconds: config.actionWindowSeconds },
      },
    });

    const actionsTaken = ['ALERT'];
    const member = await guild.members.fetch(executor.id).catch(() => null);
    if (member && member.id !== guild.ownerId) {
      const dangerousRoles = member.roles.cache.filter((role) => role.editable && role.permissions.has(PermissionFlagsBits.Administrator));
      if (dangerousRoles.size > 0) {
        await member.roles.remove(dangerousRoles, `Anti-Nuke incident ${incident.id}`).catch(() => undefined);
        actionsTaken.push('REVOKE_DANGEROUS_ROLES');
      }
    }
    await prisma.securityIncident.update({ where: { id: incident.id }, data: { actionsTaken } });
    await logModule.sendLog(client, guildId, LogCategory.SECURITY, {
      eventType: 'Anti-Nuke Triggered',
      user: { id: executor.id, tag: executor.tag },
      action: 'Mitigate',
      reason: `${action} threshold exceeded: ${timestamps.length}/${threshold} in ${config.actionWindowSeconds}s`,
      guildId,
      guildName: guild.name,
      color: Colors.SECURITY_CRITICAL,
      relevantIds: { 'Incident ID': incident.id, 'Executor ID': executor.id },
      metadata: { type: incidentType, actionsTaken: actionsTaken.join(', ') },
    });
    appLogger.security('Anti-nuke triggered', guildId, { incidentId: incident.id, executorId: executor.id, action });
  },
};



