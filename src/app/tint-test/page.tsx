// Temporary: which edge colours iOS Safari takes up for its bars. Delete after.
export default function TintTest() {
  return (
    <>
      <div style={{ position: 'fixed', top: 0, left: 0, right: 0, height: 40, background: '#ff0000' }} />
      <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, height: 40, background: '#0000ff' }} />
    </>
  );
}
