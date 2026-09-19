import { type identityProvider } from '../auth.tables';

export type IdentityProviderName = (typeof identityProvider.enumValues)[number];

/**
 * One way of proving identity. It turns whatever the client sends into a
 * stable `subject` for that provider; accounts are found by (provider, subject).
 * VK ID or Yandex ID would verify their token with the provider here.
 */
export interface AuthProvider<TCredentials> {
  readonly name: IdentityProviderName;
  resolveSubject(credentials: TCredentials): Promise<string>;
}
