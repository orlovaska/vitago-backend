/**
 * What an administrator's role may do. Each value names an area of the admin
 * API; the modules put it on their admin controllers with `@AdminAuth(...)`.
 * A new value needs a migration (it is a Postgres enum) and, when an existing
 * role should get it, an update of that role in the same migration.
 */
export const ADMIN_PERMISSIONS = [
  /** Apps, tours, points, categories, media, legal documents, walking routes. */
  'content',
  'reviews',
  'promotions',
  /** Orders and purchases granted by hand. */
  'payments',
  'settings',
  'logs',
  /** SSH tools of the desktop admin panel. The API never checks it: the SSH key is the real barrier. */
  'server',
  /** Administrators and roles. */
  'admins',
] as const;

export type AdminPermission = (typeof ADMIN_PERMISSIONS)[number];

/** Only the superadmin holds these; a custom role cannot, or it could promote itself. */
export const SUPERADMIN_ONLY_PERMISSIONS: readonly AdminPermission[] = ['admins', 'server'];

export const ASSIGNABLE_PERMISSIONS = ADMIN_PERMISSIONS.filter(
  (permission) => !SUPERADMIN_ONLY_PERMISSIONS.includes(permission),
);

/** Roles the migration seeds. They always exist and cannot be changed or deleted. */
export const SYSTEM_ROLES = ['superadmin', 'promoter', 'content_manager'] as const;

export type SystemRole = (typeof SYSTEM_ROLES)[number];

/** The superadmin holds every permission, including ones added later. */
export function effectivePermissions(role: {
  systemCode: SystemRole | null;
  permissions: readonly AdminPermission[];
}): AdminPermission[] {
  return role.systemCode === 'superadmin' ? [...ADMIN_PERMISSIONS] : [...role.permissions];
}
