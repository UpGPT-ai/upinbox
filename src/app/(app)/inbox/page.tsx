import type { Metadata } from 'next';
import { InboxLayout } from './inbox-layout';

export const metadata: Metadata = {
  title: 'Inbox — UpInbox',
};

export default function InboxPage() {
  return <InboxLayout />;
}
