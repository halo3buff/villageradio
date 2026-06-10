// Shared editorial markdown renderer — the tiny hand-rolled block parser that used to live
// inline in the information page. Splits on blank lines and renders `# h1`, `---` rules, and
// paragraphs. Pure + non-async so it works in both server pages (/information, /news) and the
// client Information editor's preview. No new markdown dependency, by design.
//
// TODO(phase4-followup): extend the blocks (##/### subheads, simple bullet lists, inline
// links/images) once the editorial admin flow is confirmed in use.

export function EditorialBody({ markdown }: { markdown: string }) {
  const blocks = markdown.split(/\n\n+/).filter((s) => s.trim());

  return (
    <>
      {blocks.map((block, i) => {
        const trimmed = block.trim();
        if (trimmed.startsWith('# ')) {
          return (
            <h1 key={i} className="font-mono text-[0.65rem] tracking-[0.15em] uppercase text-vr-white mb-8">
              {trimmed.slice(2)}
            </h1>
          );
        }
        if (trimmed === '---') {
          return <hr key={i} className="border-none border-t border-white/[0.08] my-8" />;
        }
        return (
          <p key={i} className="text-sm leading-relaxed mb-6 max-w-[60ch]" style={{ color: 'rgba(200,196,187,0.75)' }}>
            {trimmed}
          </p>
        );
      })}
    </>
  );
}
