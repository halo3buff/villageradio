import { notFound } from 'next/navigation';

// Middleware rewrites unauthenticated admin requests here so the styled 404 renders
// at the original URL — admin routes look identical to genuinely missing pages.
export default function Blackhole(): never {
  notFound();
}
