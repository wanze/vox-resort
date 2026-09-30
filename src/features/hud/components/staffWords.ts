import type { StaffRole } from '../../sim/domain/staff';

const ROLE_NAMES: { readonly [role in StaffRole]: readonly [string, string] } = {
  cleaner: ['cleaner', 'cleaners'],
  lifeguard: ['lifeguard', 'lifeguards'],
  animator: ['animator', 'animators'],
  mechanic: ['mechanic', 'mechanics'],
};

export const roleWord = (role: StaffRole, count: number): string =>
  ROLE_NAMES[role][count === 1 ? 0 : 1];
