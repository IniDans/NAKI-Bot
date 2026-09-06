import type { PlaceholderContext } from '../types/index.js';

/** Replace supported welcome/leave placeholders without evaluating arbitrary input. */
export function renderPlaceholders(template: string, context: PlaceholderContext): string {
  const values: Record<string, string> = {
    '{user}': context.username,
    '{username}': context.username,
    '{displayname}': context.displayName,
    '{mention}': context.mention,
    '{server}': context.serverName,
    '{membercount}': String(context.memberCount),
    '{userid}': context.userId,
  };

  return Object.entries(values).reduce(
    (result, [token, value]) => result.split(token).join(value),
    template,
  );
}
