// Temporary: which edge colours iOS Safari takes up for its bars. Delete after.
// top: invisible but touchable; bottom: visible but untouchable
export default function TintTest() {
  return (
    <>
      <div style={{ position: 'fixed', inset: 0 }} />
      <div style={{ position: 'fixed', top: 0, left: 0, right: 0, height: 8, background: '#ff0000', opacity: 0 }} />
      <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, height: 8, background: '#0000ff', pointerEvents: 'none' }} />
    </>
  );
}
