import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

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

export const adminSchema = z.object({ id: z.uuid(), login: z.string() });

export class AdminSignInDto extends createZodDto(
  z.object({ login: z.string().min(1).max(100), password: z.string().min(1).max(200) }),
) {}

export class AdminSignInResponseDto extends createZodDto(
  z.object({ ...accessToken, admin: adminSchema }),
) {}

export class AdminDto extends createZodDto(adminSchema) {}
