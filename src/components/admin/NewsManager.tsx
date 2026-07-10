'use client';

import { useState, useRef, useEffect, useMemo } from 'react';
import type { NewsPost } from '@/lib/types';
import { moveUp, moveDown, moveTo, reindexOrder } from '@/lib/content/reorder';
import { validateNewsManifest, generatePostId } from '@/lib/content/news';
import { Banner, RowBtn, FIELD, FIELD_LABEL, FIELD_AREA } from './ui';

type Props = { initialPosts: NewsPost[]; generation: string };
type Status = 'idle' | 'publishing' | 'published' | 'conflict' | 'error';

const STATUSES: NewsPost['status'][] = ['draft', 'published'];

export function NewsManager({ initialPosts, generation: initialGen }: Props) {
  const [posts, setPosts] = useState<NewsPost[]>(initialPosts);
  const [baseline, setBaseline] = useState<NewsPost[]>(initialPosts);
  const [generation, setGeneration] = useState(initialGen);
  const [status, setStatus] = useState<Status>('idle');
  const [errors, setErrors] = useState<string[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const dragIndex = useRef<number | null>(null);

  const dirty = useMemo(() => JSON.stringify(posts) !== JSON.stringify(baseline), [posts, baseline]);

  // Warn before navigating away with unpublished edits.
  useEffect(() => {
    if (!dirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [dirty]);

  function update(next: NewsPost[]) {
    setPosts(next);
    if (status !== 'idle') setStatus('idle');
  }

  function patch(id: string, fields: Partial<NewsPost>) {
    update(posts.map((p) => (p.id === id ? { ...p, ...fields } : p)));
  }

  function onDrop(target: number) {
    const from = dragIndex.current;
    dragIndex.current = null;
    if (from === null || from === target) return;
    update(moveTo(posts, from, target));
  }

  function remove(id: string) {
    update(posts.filter((p) => p.id !== id));
    if (editingId === id) setEditingId(null);
  }

  function addPost() {
    const id = generatePostId('', posts.map((p) => p.id));
    update([...posts, { id, title: '', date: '', body: '', status: 'draft', order: posts.length }]);
    setEditingId(id);
  }

  async function publish() {
    const next = reindexOrder(posts);
    const check = validateNewsManifest({ version: 1, posts: next });
    if (!check.ok) {
      setErrors(check.errors);
      setStatus('error');
      return;
    }
    setErrors([]);
    setStatus('publishing');
    try {
      const res = await fetch('/api/admin/news', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ manifest: { version: 1, posts: next }, generation }),
      });
      if (res.status === 409) {
        setStatus('conflict');
        return;
      }
      if (!res.ok) {
        const b = await res.json().catch(() => ({}));
        setErrors(b.details ?? [b.error ?? 'publish failed']);
        setStatus('error');
        return;
      }
      const b = await res.json();
      setGeneration(b.generation);
      setPosts(next);
      setBaseline(next);
      setStatus('published');
    } catch {
      setErrors(['network error — try again']);
      setStatus('error');
    }
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-baseline gap-4 mb-1">
        <h1 className="font-mono text-[11px] tracking-[0.2em] uppercase text-black/80">news — editorial</h1>
        <span className="font-mono text-[9px] tracking-[0.16em] uppercase text-black/25">{posts.length} posts</span>
      </div>
      <p className="font-mono text-[9px] tracking-[0.14em] uppercase text-black/25 mb-6">
        list order is top → bottom (newest first) · drag or use ↑↓ · drafts stay hidden on the site · staged until you publish
      </p>

      {/* Banners */}
      {status === 'conflict' && (
        <Banner tone="warn">
          news changed elsewhere — reload the page to get the latest, then redo your edits.
        </Banner>
      )}
      {status === 'error' && errors.length > 0 && (
        <Banner tone="warn">
          {errors.map((e, i) => (
            <span key={i} className="block">
              {e}
            </span>
          ))}
        </Banner>
      )}
      {status === 'published' && <Banner tone="ok">published — changes are live.</Banner>}

      {/* List */}
      {posts.length === 0 ? (
        <p className="font-mono text-[9px] tracking-[0.14em] uppercase text-black/20 py-4">no posts yet</p>
      ) : (
        <ul className="border-t border-black/10">
          {posts.map((post, i) => (
            <li
              key={post.id}
              draggable={editingId !== post.id}
              onDragStart={() => (dragIndex.current = i)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => onDrop(i)}
              className="border-b border-black/10"
            >
              <div className="flex items-center gap-3 py-2.5">
                <span className="font-mono text-[9px] text-black/20 w-6 shrink-0 text-right">
                  {String(i + 1).padStart(2, '0')}
                </span>
                <span className="font-mono text-[10px] text-black/15 shrink-0 cursor-grab select-none">⠿</span>
                <span className="font-mono text-[10px] text-black/80 flex-1 min-w-0 truncate">
                  {post.title || <span className="text-black/30">untitled</span>}
                  <span className="text-black/25"> · {post.date || 'no date'}</span>
                </span>
                <span
                  className={`font-mono text-[9px] tracking-[0.14em] uppercase w-16 shrink-0 text-right ${
                    post.status === 'published' ? 'text-black/30' : 'text-black/55'
                  }`}
                >
                  {post.status === 'published' ? 'live' : 'draft'}
                </span>
                <span className="flex items-center gap-2 shrink-0 ml-1">
                  <RowBtn onClick={() => update(moveUp(posts, i))} disabled={i === 0} label="↑" />
                  <RowBtn onClick={() => update(moveDown(posts, i))} disabled={i === posts.length - 1} label="↓" />
                  <RowBtn
                    onClick={() => setEditingId(editingId === post.id ? null : post.id)}
                    label={editingId === post.id ? 'close' : 'edit'}
                  />
                  <RowBtn onClick={() => remove(post.id)} label="remove" />
                </span>
              </div>

              {editingId === post.id && <PostEditor post={post} onChange={(fields) => patch(post.id, fields)} />}
            </li>
          ))}
        </ul>
      )}

      {/* Add */}
      <div className="mt-5">
        <button
          onClick={addPost}
          className="font-mono text-[10px] tracking-[0.16em] uppercase text-black/45 hover:text-black border border-black/15 hover:border-black/40 px-3 py-2 transition-colors"
        >
          + add post
        </button>
      </div>

      {/* Publish bar */}
      <div className="mt-8 flex items-center gap-4 border-t border-black/10 pt-5">
        <button
          onClick={publish}
          disabled={!dirty || status === 'publishing'}
          className="font-mono text-[10.5px] tracking-[0.18em] uppercase text-black border border-black/20 hover:border-black/60 px-4 py-2.5 transition-colors disabled:opacity-30 disabled:hover:border-black/20"
        >
          {status === 'publishing' ? 'publishing..' : 'publish'}
        </button>
        <span className="font-mono text-[9px] tracking-[0.16em] uppercase text-black/30">
          {dirty ? 'staged changes' : 'no changes'}
        </span>
      </div>
    </div>
  );
}

function PostEditor({ post, onChange }: { post: NewsPost; onChange: (fields: Partial<NewsPost>) => void }) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-x-5 gap-y-4 pb-5 pl-9 pr-1">
      <label className="col-span-2">
        <span className={FIELD_LABEL}>title</span>
        <input className={FIELD} value={post.title} onChange={(e) => onChange({ title: e.target.value })} />
      </label>
      <label>
        <span className={FIELD_LABEL}>date (yyyy-mm-dd)</span>
        <input
          className={FIELD}
          value={post.date}
          placeholder="2026-06-09"
          onChange={(e) => onChange({ date: e.target.value })}
        />
      </label>
      <label>
        <span className={FIELD_LABEL}>status</span>
        <select
          className={FIELD}
          value={post.status}
          onChange={(e) => onChange({ status: e.target.value as NewsPost['status'] })}
        >
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </label>
      <label className="col-span-2 md:col-span-4">
        <span className={FIELD_LABEL}>body (markdown · blank line between paragraphs · # heading · --- divider)</span>
        <textarea className={FIELD_AREA} rows={8} value={post.body} onChange={(e) => onChange({ body: e.target.value })} />
      </label>
    </div>
  );
}
