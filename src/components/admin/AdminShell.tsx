import { SidebarNav } from './SidebarNav';

/** Console chrome for the admin panel: a flat sidebar + a borderless content column. */
export function AdminShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-[70vh] border-t border-white/10 page-enter">
      <SidebarNav />
      <main className="flex-1 min-w-0 px-6 py-7">{children}</main>
    </div>
  );
}
