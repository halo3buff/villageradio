export const runtime = 'nodejs';

export function GET() {
  return Response.json({ t: Date.now() });
}
