// Temporary: which edge colours iOS Safari takes up for its bars. Delete after.
const shade = { position: 'fixed', inset: 0 } as const;
const photo = { position: 'fixed', inset: 0, backgroundColor: '#ff0000', backgroundImage: 'url(/site_assets/site_bg_v2.webp)', backgroundSize: 'cover', backgroundPosition: 'center' } as const;
const strip = (edge: 'top' | 'bottom', h: number) => ({ position: 'fixed', left: 0, right: 0, [edge]: 0, height: h, background: edge === 'top' ? '#ff0000' : '#0000ff' }) as const;

export default async function TintTest({ searchParams }: { searchParams: Promise<{ v?: string }> }) {
  const v = (await searchParams).v ?? 'a';
  return (
    <>
      {v === 'a' && <><div style={shade} /><div style={strip('top', 40)} /><div style={strip('bottom', 40)} /></>}
      {v === 'b' && <><div style={strip('top', 8)} /><div style={strip('bottom', 8)} /></>}
      {v === 'c' && <div style={photo} />}
      {v === 'd' && <><div style={photo} /><div style={shade} /></>}
      <div style={{ position: 'fixed', top: '40%', left: 0, right: 0, textAlign: 'center', fontSize: 64, color: '#fff' }}>{v.toUpperCase()}</div>
    </>
  );
}
