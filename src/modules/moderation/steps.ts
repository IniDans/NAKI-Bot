/** Pure helpers for warn escalation steps, kept free of Discord/DB imports so they are easy to test. */
export const ESCALATION_ACTIONS = ['TIMEOUT', 'KICK', 'BAN', 'TEMPBAN'] as const;
export type EscalationAction = (typeof ESCALATION_ACTIONS)[number];

export interface EscalationStep {
  warns: number;
  action: EscalationAction;
  duration?: string;
}

/** Reads the stored steps, dropping anything malformed instead of throwing. */
export function parseSteps(raw: unknown): EscalationStep[] {
  if (!Array.isArray(raw)) return [];
  const steps: EscalationStep[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const { warns, action, duration } = item as Record<string, unknown>;
    if (typeof warns !== 'number' || !Number.isInteger(warns) || warns < 1) continue;
    if (!ESCALATION_ACTIONS.includes(action as EscalationAction)) continue;
    steps.push({ warns, action: action as EscalationAction, duration: typeof duration === 'string' ? duration : undefined });
  }
  return steps.sort((a, b) => a.warns - b.warns);
}
