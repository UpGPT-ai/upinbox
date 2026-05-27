/**
 * Global test setup for UpInbox
 *
 * - Stubs process.env for all tests
 * - Sets up common global mocks
 */

import { vi } from 'vitest';

// Stub environment variables required by modules
process.env.PLATFORM_ENCRYPTION_KEY = 'a'.repeat(64); // 64 hex chars = 32 bytes
process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test-anon-key';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key';
process.env.UPINBOX_INTELLIGENCE_API_URL = 'https://api.upinbox.ai';
process.env.UPINBOX_LICENSE_SIGNING_KEY = 'b'.repeat(64);

// Mock next/headers — not available outside Next.js runtime
vi.mock('next/headers', () => ({
  cookies: vi.fn().mockResolvedValue({
    getAll: () => [],
    set: vi.fn(),
  }),
}));

// Mock @supabase/ssr — avoid real network calls
vi.mock('@supabase/ssr', () => ({
  createServerClient: vi.fn().mockReturnValue({
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: null }),
    },
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnThis(),
      insert: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
      upsert: vi.fn().mockReturnThis(),
      delete: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null, error: null }),
      limit: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
    }),
  }),
}));
