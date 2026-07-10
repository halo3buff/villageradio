import { SootSprite } from '@/components/SootSprite';
import { HomeShell } from '@/components/HomeShell';
import { getCommands } from '@/lib/content/loaders';

export default async function Home() {
  const commands = await getCommands();
  return (
    <>
      {/* Hidden admin entry — homepage only (secret key sequence → sprite → login overlay) */}
      <SootSprite />

      {/* Desktop or mobile composition, chosen by viewport */}
      <HomeShell commands={commands} />
    </>
  );
}
