/**
 * UpInbox Mail Provider Factory
 *
 * Server-side only. Never import this from client components.
 * Client components must call API routes, which call getMailProvider() on the server.
 *
 * Usage:
 *   import { getMailProvider } from '@/lib/mail/providers';
 *   const provider = await getMailProvider(account);
 *   const mailboxes = await provider.listMailboxes();
 */

import { decryptCredentials } from '@/lib/mail/crypto/credentials';
import { JmapProvider } from './jmap';
import { ImapProvider } from './imap';
import type { MailProvider } from './types';

// Re-export the MailProvider interface and providers for convenience
export type { MailProvider } from './types';
export { JmapProvider } from './jmap';
export { ImapProvider } from './imap';

/**
 * UpInbox account shape from Supabase (upinbox.accounts table).
 * Only the fields needed to construct a provider are required here.
 */
export interface UpInboxAccount {
  id: string;
  email_address: string;
  provider_type: 'jmap' | 'imap';
  encrypted_credentials: string;
  // JMAP-specific
  jmap_session_url?: string;
  // Provider metadata
  display_name?: string;
}

/**
 * Factory: construct the correct MailProvider from a decrypted account record.
 *
 * Credentials are decrypted using PLATFORM_ENCRYPTION_KEY (org-managed).
 * The decrypted credentials are NEVER logged, stored in memory longer than
 * needed, or transmitted back to the client.
 *
 * @throws if provider_type is unknown or credentials cannot be decrypted
 */
export async function getMailProvider(account: UpInboxAccount): Promise<MailProvider> {
  // Decrypt credentials — key is PLATFORM_ENCRYPTION_KEY env var
  const credentials = await decryptCredentials(account.encrypted_credentials);

  switch (account.provider_type) {
    case 'jmap': {
      if (!account.jmap_session_url) {
        throw new Error(
          `Account ${account.id} is type 'jmap' but has no jmap_session_url`
        );
      }
      return JmapProvider.create(account, credentials);
    }

    case 'imap': {
      return ImapProvider.create(account, credentials);
    }

    default: {
      // TypeScript exhaustiveness check
      const _exhaustive: never = account.provider_type;
      throw new Error(`Unknown provider_type: ${_exhaustive}`);
    }
  }
}

/**
 * Type guard — check if a provider is JMAP-backed.
 * Useful for features that are JMAP-only (e.g., thread-based views).
 */
export function isJmapProvider(provider: MailProvider): provider is JmapProvider {
  return provider.providerType === 'jmap';
}

/**
 * Type guard — check if a provider is IMAP-backed.
 */
export function isImapProvider(provider: MailProvider): provider is ImapProvider {
  return provider.providerType === 'imap';
}
