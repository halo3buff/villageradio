import type { Metadata } from 'next';
import { LoginForm } from './login-form';

// Keep the panel out of search indexes.
export const metadata: Metadata = { title: 'VLG.FM', robots: { index: false, follow: false } };

export default function RelayPage() {
  return (
    <div className="min-h-[70vh] flex items-center justify-center px-5 page-enter">
      <LoginForm />
    </div>
  );
}
