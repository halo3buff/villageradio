'use client';

import Link from 'next/link';
import Image from 'next/image';
import type { NewsPost } from '@/lib/types';

const MONO = "var(--font-ibm-plex-mono, var(--font-space-mono)), 'Courier New', monospace";

/** Deterministic 4-char hex fingerprint from a string (FNV-1a). */
function hexId(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).slice(0, 4).toUpperCase().padStart(4, '0');
}

/** Split markdown body into renderable paragraphs, stripping basic markers. */
function bodyParagraphs(md: string): string[] {
  return md
    .split(/\n{2,}/)
    .map(p =>
      p
        .replace(/^#{1,6}\s+/, '')
        .replace(/\*\*(.*?)\*\*/g, '$1')
        .replace(/\*(.*?)\*/g, '$1')
        .replace(/^[-*]\s+/, '· ')
        .trim(),
    )
    .filter(p => p && p !== '---');
}

export function MobileNews({ posts }: { posts: NewsPost[] }) {
  return (
    <div style={{ background: '#fff', minHeight: '100dvh', padding: '16px 22px 48px' }}>
      <div className="page-enter">

        {/* Back arrow */}
        <Link href="/" style={{ display: 'block', width: 50, height: 50, marginBottom: 20 }}>
          <Image src="/icons/left-arrow.png" alt="Back" width={50} height={50}
            style={{ width: 50, height: 50, objectFit: 'contain' }} />
        </Link>

        {/* Log header */}
        <div style={{
          fontFamily: MONO, fontSize: 10, color: '#999',
          letterSpacing: '0.08em', marginBottom: 18,
          borderBottom: '1px solid #e8e8e8', paddingBottom: 12,
        }}>
          {'// TRANSMISSION_LOG — VLG.FM'}
        </div>

        {/* Posts */}
        {posts.length === 0 ? (
          <div style={{ fontFamily: MONO, fontSize: 10, color: '#bbb', letterSpacing: '0.06em' }}>
            NO_RECORDS_FOUND · 0x0000
          </div>
        ) : posts.map((post, idx) => (
          <div key={post.id} style={{ marginBottom: 32 }}>

            {/* Record stamp */}
            <div style={{
              fontFamily: MONO, fontSize: 9, color: '#bbb',
              letterSpacing: '0.05em', marginBottom: 5,
            }}>
              {post.date ? `${post.date}T00:00:00Z` : 'YYYY-MM-DDT00:00:00Z'}
              {'  '}REC_0x{hexId(post.id)}
              {'  '}{String(idx + 1).padStart(3, '0')}
            </div>

            {/* Title */}
            <div style={{
              fontFamily: MONO, fontSize: 12, color: '#000',
              letterSpacing: '0.04em', marginBottom: 8,
            }}>
              {'* '}{post.title.toUpperCase()}
            </div>

            {/* Rule */}
            <div style={{ borderTop: '1px solid #e0e0e0', marginBottom: 10 }} />

            {/* Body */}
            <div style={{
              fontFamily: MONO, fontSize: 10, color: '#444',
              lineHeight: '17px', letterSpacing: '0.02em',
            }}>
              {bodyParagraphs(post.body).map((para, i) => (
                <p key={i} style={{ margin: '0 0 10px 0' }}>{para}</p>
              ))}
            </div>

          </div>
        ))}

        {/* Footer strip */}
        <div style={{
          marginTop: 8, borderTop: '1px solid #e8e8e8', paddingTop: 12,
          fontFamily: MONO, fontSize: 9, color: '#ccc',
          letterSpacing: '0.06em', lineHeight: '16px', whiteSpace: 'pre',
        }}>
          {'VLG/FM — VILLAGE RADIO\nSIGNAL ARCHIVE — ACTIVE\ncloudmain2stock@gmail.com'}
        </div>

      </div>
    </div>
  );
}
