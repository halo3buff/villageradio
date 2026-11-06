import { AdminBar } from './AdminBar';

/** Console chrome for the admin panel: one bar across the top, the page under it. */
export function AdminShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="admin-shell flex flex-col min-h-screen bg-[var(--vlg-bg,#000)] text-white page-enter">
      <AdminBar />
      <main className="flex-1 min-w-0 px-4 md:px-6 py-7">{children}</main>
    </div>
  );
}
