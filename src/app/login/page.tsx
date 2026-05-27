import type { Metadata } from 'next';
import { LoginForm } from './login-form';

export const metadata: Metadata = {
  title: 'Sign in — UpInbox',
};

export default function LoginPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center space-y-2">
          <h1 className="text-2xl font-bold">UpInbox</h1>
          <p className="text-muted-foreground text-sm">
            Your email. Your AI. Your rules.
          </p>
        </div>
        <LoginForm />
        <p className="text-center text-xs text-muted-foreground">
          Open source ·{' '}
          <a
            href="https://github.com/UpGPT-ai/upinbox"
            className="underline hover:text-foreground"
            target="_blank"
            rel="noopener noreferrer"
          >
            GitHub
          </a>{' '}
          · MIT License
        </p>
      </div>
    </div>
  );
}
