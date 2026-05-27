import type { Metadata } from 'next';
import { SettingsShell } from './settings-shell';

export const metadata: Metadata = {
  title: 'Settings — UpInbox',
};

export default function SettingsPage() {
  return <SettingsShell />;
}
