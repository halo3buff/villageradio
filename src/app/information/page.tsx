import type { Metadata } from 'next';
import { getInformation, getCommands } from '@/lib/content/loaders';
import { InfoShell } from '@/components/InfoShell';

export const metadata: Metadata = { title: 'Information' };

export default async function InformationPage() {
  const [content, commands] = await Promise.all([getInformation(), getCommands()]);
  return <InfoShell content={content} commands={commands} />;
}
