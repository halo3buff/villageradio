import { SootSprite } from '@/components/SootSprite';
import { HomeTemp } from '@/components/HomeTemp';
import { getCommands } from '@/lib/content/loaders';

export default async function Home() {
  const commands = await getCommands();
  return (
    <>
      {/* Hidden admin entry — homepage only (secret key sequence → sprite → login overlay) */}
      <SootSprite />

      {/* Temporary bare homescreen while the rest is rebuilt.
          Restore the full composition by swapping this for <HomeShell commands={commands} />. */}
      <HomeTemp commands={commands} />
    </>
  );
}
