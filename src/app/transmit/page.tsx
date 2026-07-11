import Link from 'next/link';
import Image from 'next/image';
import type { Viewport } from 'next';
import { Oscilloscope } from '@/components/Oscilloscope';
import { Gate } from '@/components/Gate';

export const viewport: Viewport = {
  themeColor: '#ffffff',
};

export const metadata = {
  title: 'Transmit',
  description: 'Send a transmission to Village Radio.',
};

export default function TransmitPage() {
  return (
    <Gate path="/transmit">
    <div style={{ position: 'fixed', inset: 0, overflowY: 'auto', background: 'var(--vlg-bg, #fff)', color: 'var(--vlg-fg, #000)' }}>
      <div style={{ position: 'relative', minHeight: '100%' }}
           className="px-4 sm:px-6 pt-14 sm:pt-20 pb-8 page-enter">
        <Link href="/" style={{ position: 'absolute', top: 16, left: 16, display: 'block' }}>
          <Image src="/icons/left-arrow.png" alt="Back" width={32} height={32}
            style={{ width: 32, height: 32, objectFit: 'contain' }} />
        </Link>
        <Oscilloscope />
      </div>
    </div>
    </Gate>
  );
}
