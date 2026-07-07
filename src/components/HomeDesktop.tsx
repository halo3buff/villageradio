import Link from 'next/link';
import { GrantLink } from '@/components/GrantLink';
import { FitStage } from '@/components/FitStage';
import { HeaderCluster } from '@/components/HeaderCluster';
import { MobileScope } from '@/components/mobile/MobileScope';
import { ScopeTelemetry } from '@/components/ScopeTelemetry';

const DISPLAY = 'var(--font-hn-black), "Helvetica Neue", Arial, sans-serif';
const BODY = 'var(--font-hn-medium), "Helvetica Neue", Arial, sans-serif';
const SEGOE = "'Segoe UI', system-ui, 'Helvetica Neue', Arial, sans-serif";
const RED = '#ff0000';

function RedLink({ href, children }: { href: string; children: string }) {
  return (
    <GrantLink href={href} style={{ color: RED, textDecoration: 'none' }}>
      {children}
    </GrantLink>
  );
}

/** Desktop homepage composition — same stage/paragraph as mobile, desktop sizing. */
export function HomeDesktop() {
  return (
    <FitStage
      left={
        <>
          {/* README — top-left, links to /information */}
          <Link
            href="/information"
            style={{
              position: 'absolute', left: 35, top: 35,
              fontFamily: SEGOE, fontSize: 11, lineHeight: '11px',
              color: '#000', textDecoration: 'none', pointerEvents: 'auto',
            }}
          >
            README
          </Link>

          {/* Chromeless vectorscope — same component as mobile */}
          <div style={{ position: 'absolute', left: 274, top: 200, width: 600, height: 660, pointerEvents: 'auto' }}>
            <MobileScope />
          </div>

          {/* Telemetry overlays: headers, clock, SNR, ticker, scanlines */}
          <ScopeTelemetry />

          {/* Broadcast status — top-left of scope box */}
          <div style={{
            position: 'absolute', left: 282, top: 208,
            fontFamily: BODY, fontSize: 11, lineHeight: '11px', textTransform: 'uppercase',
            color: '#000', zIndex: 3, pointerEvents: 'none',
          }}>
            {'> BROADCAST '}
            <span style={{ color: RED }}>[LIVE]</span>
            <span style={{ color: RED, animation: 'vr-blink 1s step-end infinite' }}> █</span>
          </div>

          {/* send transmission — moved slightly down + left from original (33,872), underscore prefix */}
          <GrantLink
            href="/transmit"
            style={{
              position: 'absolute',
              left: 20,
              top: 890,
              pointerEvents: 'auto',
              fontFamily: DISPLAY,
              fontSize: 36,
              lineHeight: 1,
              letterSpacing: '-0.13em',
              color: '#000000',
              textDecoration: 'none',
              whiteSpace: 'nowrap',
            }}
          >
            {'__________send transmission'}
          </GrantLink>
        </>
      }
      right={
        <>
          {/* VILLAGE RADIO logo cluster — top right */}
          <HeaderCluster />

          {/* Broken-code paragraph — X=1123 Y=213 W=262, HN Medium 11, flipped H+V.
              Source-code structure preserved (pre-wrap). Nav links are the words
              encoded as zero-based letter numbers, in red. */}
          <div
            style={{
              position: 'absolute',
              left: 1150,
              top: 208,
              width: 262,
              pointerEvents: 'auto',
              fontFamily: BODY,
              fontSize: 11,
              lineHeight: 'normal',
              textAlign: 'justify',
              textTransform: 'uppercase',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
              color: '#000000',
              transform: 'scale(-1, -1)',
              transformOrigin: 'center center',
            }}
          >
            {`<svg width="1440" height="1024" viewBox="0 0 1440 1024" fill="none" xmlns="http://www.w3.org/2000/svg">
<rect width="1440" height="1024"  d="M987.457804.608L1008.78 740.093H1032.73L1053.46 804.608H1031.95L1028.44 793.1C1024.35

779.509 1021.73 768.364 1020.56 759.846C1019.39 768.001 1016.66 779.056 1012.57 793.01L1009.17 fefefe
2.269 738.553C962.102 738.553 970.085 741.724 976.121 747.813 `}
            <RedLink href="/news">13 4 22 18</RedLink>
            {`4 754.138 985.272 762.293 985.272 772.35C                            27 982.059 790.291 975.439 796.634C968.819 802.977 960.349 806.148 949.932 88.34V609.392H1167.02V657.053H1136.26Z" fill="black"/>
<path d="M1231.81 745

2.825 754.228 938.834 756.675 937.374 761.749H946.525V775.612H918Z" fill="black"/>
<path d="M1051.82 639.514V623.839H1088.33V615.775H1055.23V600.824H1088.33V591.4H1050.85V575H1109.26V639.514H1051.82Z" fill="black"/>
<path d="M1224.99 609.392L1246.31 673.907H1270.26L1291 609.392H1269.48L1265.98 620.9C1261.89 634.491 1259.26 645.636 1258.09 654.154C1256.93 645.999 1254.2 634.944 1250.11 620.99L1 `}
            <RedLink href="/photography">15 7 14 19 14 6 17 0 15 7 24</RedLink>
            {` 246.7 609.392H1224.99Z" fill="black"/>
<path d="M1199.54 609.392V673.907H1220.76V609.392H1199.54Z" fill="black"/>
<path d="M1136.26 657.053V673.9 669.617C1000.08 664.271 1006.8 661.553 1015.27 661.553C1025.1 661.553

 1033.08 664.724 1039.12 670.886C1045.25 677.138 1048.27 685.293 1048.27 `}
            <RedLink href="/work">22 14 17 10</RedLink>
            {` fgayi f2452 031.82 725.977 1023.35 729.1 1012.93 729.148C1005.05 729.148 998.134 726.883

992.293 722.443C986.452 718.003 983.044 712.204 982.071 705.046H1002.52C1003.98 710.029 1007.58 712.fweef36 1025.69 684.477 1023.15 681.578C1020.72 678.678 1017.12 677.228 1012.35 677.228C10 01.83 679.675 1000.37 684.749H1009.52V698.612H981Z" fill="black"/>
<path d="M1051.82 639.514V623.839H1088.33V615.775H1055.23V600.824H1088.33V591.4H1050.85V575H1109.26V639.514H1051.82Z" fill="black"/>
<path620.99L1246.7 609.392H1224.99Z" fill="black"/>
<pat.76V62H1`}
            <RedLink href="/listen">11 8 18 19 4 13</RedLink>
            {`            199.54Z" fill="black"/>9.52V698.612H981Z" fill="black"/>
<path d="M1051.82 639.514V623.839H1088.33V615.775H1055.23V600.824H1088.33V591.4H1050.85V575H1109.26V639.511.81 745.146V762H1283.89V697.486H1262.57V745.146H1231.81Z" fill="black"/>
<path d=d="M1208.fill="black"/>`}
          </div>
        </>
      }
    />
  );
}
