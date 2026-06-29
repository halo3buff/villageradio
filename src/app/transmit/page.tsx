import Link from 'next/link';
import Image from 'next/image';
import type { Viewport } from 'next';
import { Oscilloscope } from '@/components/Oscilloscope';

export const viewport: Viewport = {
  themeColor: '#ffffff',
};

export const metadata = {
  title: 'Transmit',
  description: 'Send a transmission to Village Radio.',
};

export default function TransmitPage() {
  return (
    <div style={{ background: '#fff', minHeight: '100dvh', color: '#000', position: 'relative' }}
         className="px-4 sm:px-5 pt-16 sm:pt-20 pb-8 page-enter">
      <Link href="/" style={{ position: 'absolute', top: 16, left: 16, display: 'block' }}>
        <Image src="/icons/left-arrow.png" alt="Back" width={32} height={32}
          style={{ width: 32, height: 32, objectFit: 'contain' }} />
      </Link>
      <Oscilloscope />
    </div>
  );
}
