import { Oscilloscope } from '@/components/Oscilloscope';

export const metadata = {
  title: 'Transmit',
  description: 'Send a transmission to Village Radio.',
};

export default function TransmitPage() {
  return (
    <div className="px-4 sm:px-5 pt-2 sm:pt-3 page-enter">
      <div className="mb-3 sm:mb-4 text-xs tracking-[0.15em] text-[rgba(200,196,187,0.7)]">
        SEND TRANSMISSION
      </div>
      <Oscilloscope />
    </div>
  );
}
