'use client';

import { useState, useRef, useEffect, useMemo } from 'react';
import Image from 'next/image';
import type { WorkProject } from '@/lib/types';
import { moveUp, moveDown, moveTo, reindexOrder } from '@/lib/content/reorder';
import { validateWorkManifest, generateProjectId } from '@/lib/content/work';
import { workImageUrl } from '@/lib/content/media';
import { Banner, RowBtn, FIELD, FIELD_LABEL } from './ui';

type Props = { initialProjects: WorkProject[]; generation: string };
type Status = 'idle' | 'publishing' | 'published' | 'conflict' | 'error';

const CATEGORIES: WorkProject['category'][] = ['branding', 'print', 'motion', 'identity'];

export function WorkManager({ initialProjects, generation: initialGen }: Props) {
  const [projects, setProjects] = useState<WorkProject[]>(initialProjects);
  const [baseline, setBaseline] = useState<WorkProject[]>(initialProjects);
  const [generation, setGeneration] = useState(initialGen);
  const [status, setStatus] = useState<Status>('idle');
  const [errors, setErrors] = useState<string[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState('');
  const dragIndex = useRef<number | null>(null);

  const dirty = useMemo(
    () => JSON.stringify(projects) !== JSON.stringify(baseline),
    [projects, baseline],
  );

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

  function update(next: WorkProject[]) {
    setProjects(next);
    if (status !== 'idle') setStatus('idle');
  }

  function patch(id: string, fields: Partial<WorkProject>) {
    update(projects.map((p) => (p.id === id ? { ...p, ...fields } : p)));
  }

  function onDrop(target: number) {
    const from = dragIndex.current;
    dragIndex.current = null;
    if (from === null || from === target) return;
    update(moveTo(projects, from, target));
  }

  function remove(id: string) {
    update(projects.filter((p) => p.id !== id));
    if (editingId === id) setEditingId(null);
  }

  function addProject() {
    const id = generateProjectId('', projects.map((p) => p.id));
    update([
      ...projects,
      { id, title: '', year: new Date().getFullYear(), category: 'branding', images: [], order: projects.length },
    ]);
    setEditingId(id);
  }

  async function uploadImage(projectId: string, picked: File) {
    setUploadingId(projectId);
    setUploadError('');
    try {
      const body = new FormData();
      body.append('image', picked);
      body.append('filename', picked.name);
      const res = await fetch('/api/admin/work/upload', { method: 'POST', body });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.ok) {
        setUploadError(json.error ?? 'upload failed');
        return;
      }
      const project = projects.find((p) => p.id === projectId);
      if (project) patch(projectId, { images: [...project.images, json.key] });
    } catch {
      setUploadError('network error');
    } finally {
      setUploadingId(null);
    }
  }

  function removeImage(projectId: string, key: string) {
    const project = projects.find((p) => p.id === projectId);
    if (project) patch(projectId, { images: project.images.filter((k) => k !== key) });
  }

  async function publish() {
    const next = reindexOrder(projects);
    const check = validateWorkManifest({ version: 1, projects: next });
    if (!check.ok) {
      setErrors(check.errors);
      setStatus('error');
      return;
    }
    setErrors([]);
    setStatus('publishing');
    try {
      const res = await fetch('/api/admin/work', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ manifest: { version: 1, projects: next }, generation }),
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
      setProjects(next);
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
        <h1 className="font-mono text-[11px] tracking-[0.2em] uppercase text-white/80">work — portfolio</h1>
        <span className="font-mono text-[9px] tracking-[0.16em] uppercase text-white/25">
          {projects.length} projects
        </span>
      </div>
      <p className="font-mono text-[9px] tracking-[0.14em] uppercase text-white/25 mb-6">
        grid order is top → bottom · drag or use ↑↓ · first image is the cover · staged until you publish
      </p>

      {/* Banners */}
      {status === 'conflict' && (
        <Banner tone="warn">
          work changed elsewhere — reload the page to get the latest, then redo your edits.
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
      {projects.length === 0 ? (
        <p className="font-mono text-[9px] tracking-[0.14em] uppercase text-white/20 py-4">no projects yet</p>
      ) : (
        <ul className="border-t border-white/10">
          {projects.map((project, i) => (
            <li
              key={project.id}
              draggable={editingId !== project.id}
              onDragStart={() => (dragIndex.current = i)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => onDrop(i)}
              className="border-b border-white/10"
            >
              <div className="flex items-center gap-3 py-2.5">
                <span className="font-mono text-[9px] text-white/20 w-6 shrink-0 text-right">
                  {String(i + 1).padStart(2, '0')}
                </span>
                <span className="font-mono text-[10px] text-white/15 shrink-0 cursor-grab select-none">⠿</span>
                <span className="relative w-8 h-8 shrink-0 overflow-hidden border border-white/10 bg-white/[0.02]">
                  {project.images[0] && (
                    <Image src={workImageUrl(project.images[0])} alt="" fill sizes="32px" className="object-cover" />
                  )}
                </span>
                <span className="font-mono text-[10px] text-white/80 flex-1 min-w-0 truncate">
                  {project.title || <span className="text-white/30">untitled</span>}
                  <span className="text-white/25"> · {project.category} · {project.year}</span>
                </span>
                <span className="font-mono text-[9px] text-white/30 w-16 shrink-0 text-right">
                  {project.images.length} img
                </span>
                <span className="flex items-center gap-2 shrink-0 ml-1">
                  <RowBtn onClick={() => update(moveUp(projects, i))} disabled={i === 0} label="↑" />
                  <RowBtn onClick={() => update(moveDown(projects, i))} disabled={i === projects.length - 1} label="↓" />
                  <RowBtn
                    onClick={() => setEditingId(editingId === project.id ? null : project.id)}
                    label={editingId === project.id ? 'close' : 'edit'}
                  />
                  <RowBtn onClick={() => remove(project.id)} label="remove" />
                </span>
              </div>

              {editingId === project.id && (
                <ProjectEditor
                  project={project}
                  uploading={uploadingId === project.id}
                  uploadError={uploadingId === null ? uploadError : ''}
                  onChange={(fields) => patch(project.id, fields)}
                  onUpload={(file) => uploadImage(project.id, file)}
                  onRemoveImage={(key) => removeImage(project.id, key)}
                />
              )}
            </li>
          ))}
        </ul>
      )}

      {/* Add */}
      <div className="mt-5">
        <button
          onClick={addProject}
          className="font-mono text-[10px] tracking-[0.16em] uppercase text-white/45 hover:text-white border border-white/15 hover:border-white/40 px-3 py-2 transition-colors"
        >
          + add project
        </button>
      </div>

      {/* Publish bar */}
      <div className="mt-8 flex items-center gap-4 border-t border-white/10 pt-5">
        <button
          onClick={publish}
          disabled={!dirty || status === 'publishing'}
          className="font-mono text-[10.5px] tracking-[0.18em] uppercase text-white border border-white/20 hover:border-white/60 px-4 py-2.5 transition-colors disabled:opacity-30 disabled:hover:border-white/20"
        >
          {status === 'publishing' ? 'publishing..' : 'publish'}
        </button>
        <span className="font-mono text-[9px] tracking-[0.16em] uppercase text-white/30">
          {dirty ? 'staged changes' : 'no changes'}
        </span>
      </div>
    </div>
  );
}

function ProjectEditor({
  project,
  uploading,
  uploadError,
  onChange,
  onUpload,
  onRemoveImage,
}: {
  project: WorkProject;
  uploading: boolean;
  uploadError: string;
  onChange: (fields: Partial<WorkProject>) => void;
  onUpload: (file: File) => void;
  onRemoveImage: (key: string) => void;
}) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 gap-x-5 gap-y-4 pb-5 pl-9 pr-1">
      <label className="col-span-2">
        <span className={FIELD_LABEL}>title</span>
        <input className={FIELD} value={project.title} onChange={(e) => onChange({ title: e.target.value })} />
      </label>
      <label>
        <span className={FIELD_LABEL}>client</span>
        <input
          className={FIELD}
          value={project.client ?? ''}
          onChange={(e) => onChange({ client: e.target.value || undefined })}
        />
      </label>
      <label>
        <span className={FIELD_LABEL}>year</span>
        <input
          className={FIELD}
          type="number"
          value={project.year}
          onChange={(e) => onChange({ year: Number(e.target.value) })}
        />
      </label>
      <label>
        <span className={FIELD_LABEL}>category</span>
        <select
          className={FIELD}
          value={project.category}
          onChange={(e) => onChange({ category: e.target.value as WorkProject['category'] })}
        >
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </label>
      <label className="col-span-2 md:col-span-3">
        <span className={FIELD_LABEL}>description</span>
        <input
          className={FIELD}
          value={project.description ?? ''}
          onChange={(e) => onChange({ description: e.target.value || undefined })}
        />
      </label>

      {/* Images — first is the cover. */}
      <div className="col-span-2 md:col-span-3">
        <span className={FIELD_LABEL}>images (first = cover)</span>
        <div className="flex flex-wrap gap-2 mt-1">
          {project.images.map((key, idx) => (
            <span key={key} className="relative w-16 h-16 overflow-hidden border border-white/15 group">
              <Image src={workImageUrl(key)} alt="" fill sizes="64px" className="object-cover" />
              {idx === 0 && (
                <span className="absolute bottom-0 inset-x-0 px-1 font-mono text-[7px] uppercase tracking-[0.1em] text-white/70 bg-black/50">
                  cover
                </span>
              )}
              <button
                onClick={() => onRemoveImage(key)}
                className="absolute top-0 right-0 px-1 font-mono text-[9px] bg-black/55 text-white/70 hover:text-white opacity-0 group-hover:opacity-100 transition-opacity"
              >
                ×
              </button>
            </span>
          ))}
          {project.images.length === 0 && (
            <span className="font-mono text-[8px] tracking-[0.14em] uppercase text-white/25 self-center">
              no images yet
            </span>
          )}
        </div>
        <label className="block mt-2">
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            disabled={uploading}
            onChange={(e) => e.target.files?.[0] && onUpload(e.target.files[0])}
            className="block w-full font-mono text-[10px] text-white/50 file:mr-3 file:border file:border-white/20 file:bg-transparent file:px-2 file:py-1 file:font-mono file:text-[9px] file:uppercase file:tracking-[0.16em] file:text-white/70 hover:file:border-white/50"
          />
          <span className="block mt-1 font-mono text-[8px] tracking-[0.14em] uppercase text-white/30">
            {uploading ? 'uploading..' : uploadError ? uploadError : 'uploads to R2 · appended to this project'}
          </span>
        </label>
      </div>
    </div>
  );
}
