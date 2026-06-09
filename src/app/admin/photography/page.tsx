import type { PhotosManifest } from '@/lib/types';
import { requireAdmin } from '@/lib/auth/guard';
import { readManifest } from '@/lib/content/store';
import { SEED_PHOTOS } from '@/lib/content/seed';
import { PhotoManager } from '@/components/admin/PhotoManager';

// Read the LIVE manifest (real generation), never the 300s-cached public loader.
export const dynamic = 'force-dynamic';

export default async function AdminPhotography() {
  await requireAdmin();
  // Falls back to the bundled seed (generation '0' = "create if absent") until first publish.
  const res = await readManifest<PhotosManifest>('photos.json');
  const photos = res?.data.photos ?? SEED_PHOTOS.photos;
  const generation = res?.generation ?? '0';

  return <PhotoManager initialPhotos={photos} generation={generation} />;
}
