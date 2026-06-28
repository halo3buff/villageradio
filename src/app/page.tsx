import { SootSprite } from '@/components/SootSprite';
import { HomeShell } from '@/components/HomeShell';

export default function Home() {
  return (
    <>
      {/* Hidden admin entry — homepage only (secret key sequence → sprite → login overlay) */}
      <SootSprite />

      {/* Desktop or mobile composition, chosen by viewport */}
      <HomeShell />
    </>
  );
}
