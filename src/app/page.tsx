import { SootSprite } from '@/components/SootSprite';
import { HomeTemp } from '@/components/HomeTemp';

export default async function Home() {
  return (
    <>
      {/* Hidden admin entry — homepage only (secret key sequence → sprite → login overlay) */}
      <SootSprite />

      {/* Temporary bare homescreen while the rest is rebuilt.
          Restore the full composition by swapping this for <HomeShell commands={commands} />. */}
      <HomeTemp />
    </>
  );
}
