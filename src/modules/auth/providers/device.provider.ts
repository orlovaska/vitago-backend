import { createHmac } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { AppConfig } from '../../../platform/config';
import { type AuthProvider } from './auth-provider';

export interface DeviceCredentials {
  /** Random secret generated once on the device and kept in its secure storage. */
  secret: string;
}

/**
 * The device secret itself is the credential. Only its HMAC is stored, so a
 * database leak does not reveal secrets, and the lookup stays deterministic.
 */
@Injectable()
export class DeviceProvider implements AuthProvider<DeviceCredentials> {
  readonly name = 'device';

  constructor(private readonly config: AppConfig) {}

  resolveSubject({ secret }: DeviceCredentials): Promise<string> {
    const subject = createHmac('sha256', this.config.env.DEVICE_SECRET_PEPPER)
      .update(secret)
      .digest('hex');
    return Promise.resolve(subject);
  }
}
