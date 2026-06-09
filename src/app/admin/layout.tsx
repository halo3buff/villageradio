import type { Metadata } from 'next';
import { requireAdmin } from '@/lib/auth/guard';
import { AdminShell } from '@/components/admin/AdminShell';

// Keep the whole panel out of search indexes (defense in depth with the 404 gate).
export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin();
  return <AdminShell>{children}</AdminShell>;
}
