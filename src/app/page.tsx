import { SootSprite } from '@/components/SootSprite';
import { PS2Browser } from '@/components/ps2/PS2Browser';
import { getCommands } from '@/lib/content/loaders';

export default async function Home() {
  const commands = await getCommands();
  return (
    <>
      {/* Hidden admin entry — homepage only (secret key sequence → sprite → login overlay) */}
      <SootSprite />

      {/* The PS2 memory-card browser. The previous bare homescreen is <HomeTemp /> (tag baseline-2026-11-18). */}
      <PS2Browser commands={commands} />
    </>
  );
}
