import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Disable x-powered-by header
  poweredByHeader: false,

  // Security headers for email content
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=()',
          },
        ],
      },
    ];
  },

  // Server-side only packages (IMAP/SMTP cannot run in Edge runtime)
  serverExternalPackages: ['imapflow', 'nodemailer'],
};

export default nextConfig;
