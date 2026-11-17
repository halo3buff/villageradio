import { Oscilloscope } from '@/components/Oscilloscope';
import { Gate } from '@/components/Gate';

export const metadata = {
  title: 'Transmit',
  description: 'Send a transmission to Village Radio.',
};

export default function TransmitPage() {
  return (
    <Gate path="/transmit">
    <div style={{ position: 'fixed', inset: 0, overflowY: 'auto', background: 'var(--vlg-bg, #fff)', color: 'var(--vlg-fg, #000)' }}>
      {/* the scope pins itself top-left where the station's plate sits; the flow clears it */}
      <div style={{ position: 'relative', minHeight: '100%' }}
           className="px-4 sm:px-6 pt-28 pb-8 page-enter">
        <Oscilloscope />
      </div>
    </div>
    </Gate>
  );
}
