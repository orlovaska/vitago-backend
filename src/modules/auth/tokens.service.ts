import { Injectable } from '@nestjs/common';
import { jwtVerify, SignJWT } from 'jose';
import { AppConfig } from '../../platform/config';

/** Who a token is for. Each audience has its own signing key. */
export type TokenAudience = 'app' | 'admin';

export interface IssuedToken {
  accessToken: string;
  expiresIn: number;
}

const ISSUER = 'vitago-api';
const ALGORITHM = 'HS256';

@Injectable()
export class TokensService {
  private readonly keys: Record<TokenAudience, Uint8Array>;
  private readonly ttl: Record<TokenAudience, number>;

  constructor(config: AppConfig) {
    const encoder = new TextEncoder();
    this.keys = {
      app: encoder.encode(config.env.USER_JWT_SECRET),
      admin: encoder.encode(config.env.ADMIN_JWT_SECRET),
    };
    this.ttl = {
      app: config.env.USER_TOKEN_TTL_SECONDS,
      admin: config.env.ADMIN_TOKEN_TTL_SECONDS,
    };
  }

  async issue(audience: TokenAudience, subject: string): Promise<IssuedToken> {
    const expiresIn = this.ttl[audience];
    const accessToken = await new SignJWT()
      .setProtectedHeader({ alg: ALGORITHM })
      .setIssuer(ISSUER)
      .setAudience(audience)
      .setSubject(subject)
      .setIssuedAt()
      .setExpirationTime(`${expiresIn}s`)
      .sign(this.keys[audience]);
    return { accessToken, expiresIn };
  }

  /** Returns the subject, or null for any invalid, expired or foreign token. */
  async verify(audience: TokenAudience, token: string): Promise<string | null> {
    try {
      const { payload } = await jwtVerify(token, this.keys[audience], {
        issuer: ISSUER,
        audience,
        algorithms: [ALGORITHM],
      });
      return payload.sub ?? null;
    } catch {
      return null;
    }
  }
}
