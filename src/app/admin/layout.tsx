import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: { template: '%s | ChatbaseAdmin', default: 'ChatbaseAdmin' },
};

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="admin-shell">
      <nav className="admin-sidebar">
        <div className="admin-sidebar-title">ChatbaseAdmin</div>
        <Link href="/admin">Dashboard</Link>
        <Link href="/admin/conversations">Conversations</Link>
        <Link href="/admin/prompt-changes">Prompt Changes</Link>
        <Link href="/admin/sync-jobs">Sync Jobs</Link>
      </nav>
      <main className="admin-main">{children}</main>
    </div>
  );
}
