import { z } from 'zod';
import { createZodDto, patchSchema } from '../../../platform/http';
import { ADMIN_PERMISSIONS, ASSIGNABLE_PERMISSIONS, SYSTEM_ROLES } from '../admin-permissions';

const accessToken = {
  accessToken: z.string(),
  /** Seconds until the token expires; the app signs in again with its device secret after that. */
  expiresIn: z.number().int(),
};

export const userSchema = z.object({
  id: z.uuid(),
  /** Short code the user reads out to support. */
  supportCode: z.string(),
  createdAt: z.iso.datetime(),
});

export class DeviceSignInDto extends createZodDto(
  z.object({
    /** Random secret generated on the device (at least 32 characters). */
    secret: z.string().min(32).max(256),
  }),
) {}

export class DeviceSignInResponseDto extends createZodDto(
  z.object({ ...accessToken, user: userSchema, isNewUser: z.boolean() }),
) {}

export class UserDto extends createZodDto(userSchema) {}

export const roleSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  /** Set on the three roles that always exist; they cannot be changed or deleted. */
  systemCode: z.enum(SYSTEM_ROLES).nullable(),
  /** What the role may do; for the superadmin, every permission. */
  permissions: z.array(z.enum(ADMIN_PERMISSIONS)),
});

export const adminSchema = z.object({ id: z.uuid(), login: z.string(), role: roleSchema });

export class AdminSignInDto extends createZodDto(
  z.object({ login: z.string().min(1).max(100), password: z.string().min(1).max(200) }),
) {}

export class AdminSignInResponseDto extends createZodDto(
  z.object({ ...accessToken, admin: adminSchema }),
) {}

export class AdminDto extends createZodDto(adminSchema) {}

export const adminAccountSchema = adminSchema.extend({
  createdAt: z.iso.datetime(),
  disabledAt: z.iso.datetime().nullable(),
});

export class AdminAccountDto extends createZodDto(adminAccountSchema) {}

export class AdminAccountListDto extends createZodDto(
  z.object({ items: z.array(adminAccountSchema) }),
) {}

export class CreateAdminDto extends createZodDto(
  z.object({
    login: z
      .string()
      .trim()
      .min(3)
      .max(100)
      .regex(/^[A-Za-z0-9._@-]+$/, 'Latin letters, digits and . _ @ - only'),
    roleId: z.uuid(),
  }),
) {}

export class UpdateAdminDto extends createZodDto(
  patchSchema(z.object({ roleId: z.uuid(), disabled: z.boolean() })),
) {}

/** The generated password is in this response only; it is stored as a hash. */
export class CreatedAdminDto extends createZodDto(
  z.object({ admin: adminAccountSchema, password: z.string() }),
) {}

export class GeneratedPasswordDto extends createZodDto(z.object({ password: z.string() })) {}

export class RoleDto extends createZodDto(roleSchema) {}

export class RoleListDto extends createZodDto(
  z.object({
    items: z.array(roleSchema),
    /** Permissions a custom role may hold; the rest belong to the superadmin alone. */
    assignablePermissions: z.array(z.enum(ADMIN_PERMISSIONS)),
  }),
) {}

const roleFields = z.object({
  name: z.string().trim().min(1).max(60),
  permissions: z.array(z.enum(ASSIGNABLE_PERMISSIONS)).max(ADMIN_PERMISSIONS.length),
});

export class CreateRoleDto extends createZodDto(roleFields) {}

export class UpdateRoleDto extends createZodDto(patchSchema(roleFields)) {}
