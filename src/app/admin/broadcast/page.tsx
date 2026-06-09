import { requireAdmin } from '@/lib/auth/guard';

export default async function AdminBroadcast() {
  await requireAdmin();
  return (
    <div className="px-6 pt-8 page-enter">
      <p className="font-mono text-[0.7rem] tracking-[0.18em] uppercase text-white/70">Broadcast</p>
      <p className="mt-3 font-mono text-[0.65rem] tracking-[0.14em] uppercase text-white/30">
        console — Phase 2
      </p>
    </div>
  );
}
