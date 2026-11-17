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
      {/* the plate pins itself top-left where the station's sits */}
      <div style={{ position: 'relative', minHeight: '100%' }} className="page-enter">
        <Oscilloscope />
      </div>
    </div>
    </Gate>
  );
}
