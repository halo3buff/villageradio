import { SidebarNav } from './SidebarNav';

/** Console chrome for the admin panel: a flat sidebar + a borderless content column (on phones the
 *  sidebar is a strip across the top). */
export function AdminShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="admin-shell flex flex-col md:flex-row min-h-[70vh] border-t border-white/10 bg-[var(--vlg-bg,#000)] text-white page-enter">
      <SidebarNav />
      <main className="flex-1 min-w-0 px-4 md:px-6 py-7">{children}</main>
    </div>
  );
}
