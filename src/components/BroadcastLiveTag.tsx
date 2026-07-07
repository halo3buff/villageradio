'use client';

import { useAudio } from '@/lib/audio-context';

const RED = '#ff0000';

/**
 * The red status tag in the "> BROADCAST" header. Normally [LIVE] with a
 * blinking block; during dead air (stream error / stall while tuned in) it
 * becomes [NO CARRIER] with the block frozen solid — the machine is still
 * on, but nothing is coming down the wire.
 */
export function BroadcastLiveTag() {
  const { carrierLost } = useAudio();
  return (
    <>
      <span style={{ color: RED }}>[{carrierLost ? 'NO CARRIER' : 'LIVE'}]</span>
      <span style={{
        color: RED,
        animation: carrierLost ? 'none' : 'vr-blink 1s step-end infinite',
      }}> █</span>
    </>
  );
}
