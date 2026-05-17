import type { Metadata } from 'next';
import { SDRWaterfall } from '@/components/SDRWaterfall';

export const metadata: Metadata = { title: 'Listen' };

export default function ListenPage() {
  return (
    <div className="px-4 sm:px-5 pt-4 sm:pt-5 page-enter overflow-x-auto">
      <SDRWaterfall />
    </div>
  );
}
