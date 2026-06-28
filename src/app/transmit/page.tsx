import Link from 'next/link';
import Image from 'next/image';
import { Oscilloscope } from '@/components/Oscilloscope';

export const metadata = {
  title: 'Transmit',
  description: 'Send a transmission to Village Radio.',
};

export default function TransmitPage() {
  return (
    <div style={{ background: '#fff', minHeight: '100vh', color: '#000', position: 'relative' }}
         className="px-4 sm:px-5 pt-20 sm:pt-24 page-enter">
      <Link href="/" style={{ position: 'absolute', top: 20, left: 16, display: 'block' }}>
        <Image src="/icons/left-arrow.png" alt="Back" width={36} height={36}
          style={{ width: 36, height: 36, objectFit: 'contain' }} />
      </Link>
      <Oscilloscope />
    </div>
  );
}
