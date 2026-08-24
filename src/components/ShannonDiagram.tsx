const MONO = "var(--font-ibm-plex-mono, var(--font-space-mono)), 'Courier New', monospace";

/**
 * ShannonDiagram — Shannon's 1948 "schematic diagram of a general communication
 * system" (references/screenshots/IMG_0742.JPG), redrawn as a theme-aware SVG.
 * Static line art; fills whatever box it's given.
 */
export function ShannonDiagram() {
  const ink = 'var(--vlg-fg, #111)';
  const text: React.CSSProperties = {
    fontFamily: MONO, fontSize: 13, letterSpacing: '0.08em', fill: ink,
  };
  return (
    <svg
      viewBox="-8 11 880 330"
      preserveAspectRatio="xMidYMid meet"
      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
      aria-label="Shannon communication system diagram"
    >
      <defs>
        <marker id="sh-arrow" viewBox="0 0 10 10" refX="9" refY="5"
          markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M 0 0 L 10 5 L 0 10 z" fill={ink} />
        </marker>
        {/* The destination is the station mark itself — black line-art recolored
            to the theme's ink through its own alpha, same trick as maskedArt(). */}
        <mask id="sh-logo" style={{ maskType: 'alpha' }}>
          <image href="/icons/hero_logo_p.png" x="726" y="48" width="138" height="138" />
        </mask>
      </defs>
      <g stroke={ink} strokeWidth="1.5" fill="none">
        {/* boxes */}
        <rect x="30" y="75" width="85" height="85" />
        <rect x="160" y="75" width="90" height="85" />
        <rect x="426" y="103" width="28" height="28" />
        <rect x="600" y="75" width="90" height="85" />
        <rect x="392" y="205" width="95" height="75" />
        {/* signal path */}
        <line x1="115" y1="117" x2="156" y2="117" markerEnd="url(#sh-arrow)" />
        <line x1="250" y1="117" x2="422" y2="117" markerEnd="url(#sh-arrow)" />
        <line x1="454" y1="117" x2="596" y2="117" markerEnd="url(#sh-arrow)" />
        <line x1="690" y1="117" x2="736" y2="117" markerEnd="url(#sh-arrow)" />
        {/* noise feed */}
        <line x1="440" y1="205" x2="440" y2="135" markerEnd="url(#sh-arrow)" />
      </g>
      <rect x="726" y="48" width="138" height="138" fill={ink} mask="url(#sh-logo)" />
      <g style={text}>
        <text x="72" y="46" textAnchor="middle">INFORMATION</text>
        <text x="72" y="62" textAnchor="middle">SOURCE</text>
        <text x="205" y="62" textAnchor="middle">TRANSMITTER</text>
        <text x="137" y="182" textAnchor="middle">MESSAGE</text>
        <text x="336" y="140" textAnchor="middle">SIGNAL</text>
        <text x="527" y="140" textAnchor="middle">RECEIVED</text>
        <text x="527" y="156" textAnchor="middle">SIGNAL</text>
        <text x="645" y="62" textAnchor="middle">RECEIVER</text>
        <text x="715" y="182" textAnchor="middle">MESSAGE</text>
        <text x="440" y="300" textAnchor="middle">NOISE</text>
        <text x="440" y="316" textAnchor="middle">SOURCE</text>
      </g>
    </svg>
  );
}
