/** Pure role panel rules, kept apart from Discord objects so they can be unit tested. */

export interface PanelOption {
  roleId: string;
  label: string;
  emoji?: string | null;
  description?: string | null;
}

export interface RoleChange {
  add: string[];
  remove: string[];
}

/** Reads the panel's Json options, dropping anything malformed. */
export function parseOptions(value: unknown): PanelOption[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== 'object') return [];
    const o = item as Record<string, unknown>;
    if (typeof o.roleId !== 'string' || !/^\d{17,20}$/.test(o.roleId)) return [];
    return [
      {
        roleId: o.roleId,
        label: typeof o.label === 'string' ? o.label : '',
        emoji: typeof o.emoji === 'string' && o.emoji ? o.emoji : null,
        description: typeof o.description === 'string' && o.description ? o.description : null,
      },
    ];
  });
}

/** A button press toggles its role; on an exclusive panel, taking one drops the others. */
export function buttonChange(has: (roleId: string) => boolean, panelRoles: string[], roleId: string, exclusive: boolean): RoleChange {
  if (has(roleId)) return { add: [], remove: [roleId] };
  return {
    add: [roleId],
    remove: exclusive ? panelRoles.filter((r) => r !== roleId && has(r)) : [],
  };
}

/** A select menu submission is the full wanted set for this panel. Values outside the panel are ignored. */
export function selectChange(has: (roleId: string) => boolean, panelRoles: string[], picked: string[], exclusive: boolean): RoleChange {
  const inPanel = new Set(panelRoles);
  let wanted = [...new Set(picked.filter((r) => inPanel.has(r)))];
  if (exclusive) wanted = wanted.slice(0, 1);
  const keep = new Set(wanted);
  return {
    add: wanted.filter((r) => !has(r)),
    remove: panelRoles.filter((r) => !keep.has(r) && has(r)),
  };
}
