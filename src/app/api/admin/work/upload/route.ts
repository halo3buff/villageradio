import { handleImageUpload } from '@/lib/image/upload-handler';

export const runtime = 'nodejs';

/** Through-app work-image upload → R2 under the `work/` prefix. Returns the stored key. */
export async function POST(req: Request): Promise<Response> {
  return handleImageUpload(req, 'work/');
}
