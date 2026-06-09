import type { Metadata } from 'next';
import Image from 'next/image';
import { getWork } from '@/lib/content/loaders';
import { workImageUrl } from '@/lib/content/media';

export const metadata: Metadata = { title: 'Work' };

export default async function WorkPage() {
  const projects = await getWork();

  return (
    <div className="page-enter">
      <div className="px-5 pt-8 pb-4 border-b border-white/[0.08]">
        <h1
          className="font-mono text-[0.65rem] tracking-[0.15em] uppercase"
          style={{ color: 'rgba(200,196,187,0.45)' }}
        >
          Work
        </h1>
      </div>

      {/* Border grid — cover is the first image; opacity-hover, no overlays (elara.world register). */}
      <div className="grid grid-cols-2 md:grid-cols-3 border-l border-t border-white/[0.08]">
        {projects.length > 0
          ? projects.map((project) => (
              <div
                key={project.id}
                className="relative aspect-square overflow-hidden border-r border-b border-white/[0.08] group"
              >
                {project.images[0] && (
                  <Image
                    src={workImageUrl(project.images[0])}
                    alt={project.title}
                    fill
                    sizes="(min-width: 768px) 33vw, 50vw"
                    className="object-cover opacity-60 group-hover:opacity-100 transition-opacity duration-300"
                  />
                )}
              </div>
            ))
          : // No projects yet — keep the grid rhythm with empty cells.
            Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="aspect-square border-r border-b border-white/[0.08]" />
            ))}
      </div>
    </div>
  );
}
