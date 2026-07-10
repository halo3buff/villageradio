'use client';

import { useState, useRef, useEffect, useMemo } from 'react';
import Image from 'next/image';
import type { Photo } from '@/lib/types';
import { moveTo, reindexOrder } from '@/lib/content/reorder';
import { validatePhotosManifest, generatePhotoId } from '@/lib/content/photos';
import { photoUrl } from '@/lib/content/media';
import { Banner, RowBtn, FIELD, FIELD_LABEL } from './ui';

type Props = { initialPhotos: Photo[]; generation: string };
type Status = 'idle' | 'publishing' | 'published' | 'conflict' | 'error';

export function PhotoManager({ initialPhotos, generation: initialGen }: Props) {
  const [photos, setPhotos] = useState<Photo[]>(initialPhotos);
  const [baseline, setBaseline] = useState<Photo[]>(initialPhotos);
  const [generation, setGeneration] = useState(initialGen);
  const [status, setStatus] = useState<Status>('idle');
  const [errors, setErrors] = useState<string[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const dragIndex = useRef<number | null>(null);

  const dirty = useMemo(() => JSON.stringify(photos) !== JSON.stringify(baseline), [photos, baseline]);
  const editing = photos.find((p) => p.id === editingId) ?? null;

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

  function update(next: Photo[]) {
    setPhotos(next);
    if (status !== 'idle') setStatus('idle');
  }

  function patch(id: string, fields: Partial<Photo>) {
    update(photos.map((p) => (p.id === id ? { ...p, ...fields } : p)));
  }

  function onDrop(target: number) {
    const from = dragIndex.current;
    dragIndex.current = null;
    if (from === null || from === target) return;
    update(moveTo(photos, from, target));
  }

  function remove(id: string) {
    update(photos.filter((p) => p.id !== id));
    if (editingId === id) setEditingId(null);
  }

  async function uploadPhoto(picked: File) {
    setUploading(true);
    setUploadError('');
    try {
      const body = new FormData();
      body.append('image', picked);
      body.append('filename', picked.name);
      const res = await fetch('/api/admin/photos/upload', { method: 'POST', body });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.ok) {
        setUploadError(json.error ?? 'upload failed');
        return;
      }
      const id = generatePhotoId(json.key, photos.map((p) => p.id));
      update([...photos, { id, key: json.key, order: photos.length }]);
    } catch {
      setUploadError('network error');
    } finally {
      setUploading(false);
    }
  }

  async function publish() {
    const next = reindexOrder(photos);
    const check = validatePhotosManifest({ version: 1, photos: next });
    if (!check.ok) {
      setErrors(check.errors);
      setStatus('error');
      return;
    }
    setErrors([]);
    setStatus('publishing');
    try {
      const res = await fetch('/api/admin/photos', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ manifest: { version: 1, photos: next }, generation }),
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
      setPhotos(next);
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
        <h1 className="font-mono text-[11px] tracking-[0.2em] uppercase text-black/80">
          photography — negative series
        </h1>
        <span className="font-mono text-[9px] tracking-[0.16em] uppercase text-black/25">
          {photos.length} photos
        </span>
      </div>
      <p className="font-mono text-[9px] tracking-[0.14em] uppercase text-black/25 mb-6">
        drag to reorder · hover a photo to edit or remove · changes are staged until you publish
      </p>

      {/* Banners */}
      {status === 'conflict' && (
        <Banner tone="warn">
          photos changed elsewhere — reload the page to get the latest, then redo your edits.
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

      {/* Upload */}
      <label className="block mb-6">
        <span className={FIELD_LABEL}>upload photo (.jpg / .png / .webp)</span>
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp"
          disabled={uploading}
          onChange={(e) => e.target.files?.[0] && uploadPhoto(e.target.files[0])}
          className="block w-full font-mono text-[10px] text-black/50 file:mr-3 file:border file:border-black/20 file:bg-transparent file:px-2 file:py-1 file:font-mono file:text-[9px] file:uppercase file:tracking-[0.16em] file:text-black/70 hover:file:border-black/50"
        />
        <span className="block mt-1 font-mono text-[8px] tracking-[0.14em] uppercase text-black/30">
          {uploading ? 'uploading..' : uploadError ? uploadError : 'uploads to R2 · appended to the end'}
        </span>
      </label>

      {/* Grid */}
      {photos.length === 0 ? (
        <p className="font-mono text-[9px] tracking-[0.14em] uppercase text-black/20 py-8">no photos yet</p>
      ) : (
        <div className="grid grid-cols-4 md:grid-cols-6 gap-1.5">
          {photos.map((p, i) => (
            <div
              key={p.id}
              draggable
              onDragStart={() => (dragIndex.current = i)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => onDrop(i)}
              className={`relative aspect-square overflow-hidden border cursor-grab group ${
                editingId === p.id ? 'border-black/60' : 'border-black/10'
              }`}
            >
              <Image
                src={photoUrl(p.key)}
                alt={p.caption ?? ''}
                fill
                sizes="16vw"
                className="object-cover opacity-70 group-hover:opacity-100 transition-opacity"
              />
              <span className="absolute top-0 left-0 px-1 py-0.5 font-mono text-[8px] text-white/60 bg-black/40">
                {String(i + 1).padStart(2, '0')}
              </span>
              <span className="absolute top-0 right-0 flex opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  onClick={() => setEditingId(editingId === p.id ? null : p.id)}
                  className="px-1 py-0.5 font-mono text-[8px] uppercase tracking-[0.1em] bg-black/55 text-white/70 hover:text-white"
                >
                  edit
                </button>
                <button
                  onClick={() => remove(p.id)}
                  className="px-1 py-0.5 font-mono text-[8px] uppercase tracking-[0.1em] bg-black/55 text-white/70 hover:text-white"
                >
                  ×
                </button>
              </span>
              {p.caption && (
                <span className="absolute bottom-0 inset-x-0 px-1 py-0.5 font-mono text-[8px] text-white/70 bg-black/40 truncate">
                  {p.caption}
                </span>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Editor */}
      {editing && (
        <div className="mt-5 border border-black/15 p-4">
          <div className="flex items-baseline justify-between mb-3">
            <span className="font-mono text-[9px] tracking-[0.16em] uppercase text-black/50">
              editing · {editing.key}
            </span>
            <RowBtn onClick={() => setEditingId(null)} label="done" />
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-x-5 gap-y-4">
            <label className="col-span-2 md:col-span-1">
              <span className={FIELD_LABEL}>caption</span>
              <input
                className={FIELD}
                value={editing.caption ?? ''}
                onChange={(e) => patch(editing.id, { caption: e.target.value || undefined })}
              />
            </label>
            <label>
              <span className={FIELD_LABEL}>date</span>
              <input
                className={FIELD}
                value={editing.date ?? ''}
                onChange={(e) => patch(editing.id, { date: e.target.value || undefined })}
              />
            </label>
            <label>
              <span className={FIELD_LABEL}>series</span>
              <input
                className={FIELD}
                value={editing.series ?? ''}
                onChange={(e) => patch(editing.id, { series: e.target.value || undefined })}
              />
            </label>
          </div>
          <div className="mt-4">
            <RowBtn onClick={() => remove(editing.id)} label="remove photo" />
          </div>
        </div>
      )}

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
