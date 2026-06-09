import { redirect } from 'next/navigation';
import { requireAdmin } from '@/lib/auth/guard';

export default async function AdminIndex() {
  await requireAdmin();
  redirect('/admin/broadcast');
}
