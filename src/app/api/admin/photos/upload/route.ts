import { handleImageUpload } from '@/lib/image/upload-handler';

export const runtime = 'nodejs';

/** Through-app photo upload → R2 under the `photos/` prefix. Returns the stored key. */
export async function POST(req: Request): Promise<Response> {
  return handleImageUpload(req, 'photos/');
}
