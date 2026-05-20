import type { Mix } from '@/lib/types';

const PROXY = '/api/audio/stream?file=';

export const broadcastPlaylist: Mix[] = [
  { id: 'inter-1',          title: 'TRANSMISSION BREAK I',   artist: 'Village Radio', date: '',           duration: '0:22', durationSec: 22,  src: `${PROXY}inter_1.mp3`,          tags: [], kind: 'inter' },
  { id: 'red-06-28-2025',   title: 'RED 06.28.2025',         artist: 'Village Radio', date: '06-28-2025', duration: '8:18', durationSec: 498, src: `${PROXY}red_06-28-2025.mp3`,   tags: [], kind: 'mix'   },
  { id: 'inter-2',          title: 'TRANSMISSION BREAK II',  artist: 'Village Radio', date: '',           duration: '0:20', durationSec: 20,  src: `${PROXY}inter_2.mp3`,          tags: [], kind: 'inter' },
  { id: 'green-04-08-2026', title: 'GREEN 04.08.2026',       artist: 'Village Radio', date: '04-08-2026', duration: '3:29', durationSec: 209, src: `${PROXY}green_04-08-2026.mp3`, tags: [], kind: 'mix'   },
  { id: 'inter-3',          title: 'TRANSMISSION BREAK III', artist: 'Village Radio', date: '',           duration: '1:45', durationSec: 105, src: `${PROXY}inter_3.mp3`,          tags: [], kind: 'inter' },
  { id: 'yellow-02-01-2026',title: 'YELLOW 02.01.2026',      artist: 'Village Radio', date: '02-01-2026', duration: '5:05', durationSec: 305, src: `${PROXY}yellow_02-01-2026.mp3`,tags: [], kind: 'mix'   },
  { id: 'inter-4',          title: 'TRANSMISSION BREAK IV',  artist: 'Village Radio', date: '',           duration: '0:20', durationSec: 20,  src: `${PROXY}inter_4.mp3`,          tags: [], kind: 'inter' },
  { id: 'green-04-10-2026', title: 'GREEN 04.10.2026',       artist: 'Village Radio', date: '04-10-2026', duration: '3:22', durationSec: 202, src: `${PROXY}green_04-10-2026.mp3`, tags: [], kind: 'mix'   },
  { id: 'inter-5',          title: 'TRANSMISSION BREAK V',   artist: 'Village Radio', date: '',           duration: '0:37', durationSec: 37,  src: `${PROXY}inter_5.mp3`,          tags: [], kind: 'inter' },
  { id: 'red-01-15-2026',   title: 'RED 01.15.2026',         artist: 'Village Radio', date: '01-15-2026', duration: '1:45', durationSec: 105, src: `${PROXY}red_01-15-2026.mp3`,   tags: [], kind: 'mix'   },
  { id: 'inter-1b',         title: 'TRANSMISSION BREAK I',   artist: 'Village Radio', date: '',           duration: '0:22', durationSec: 22,  src: `${PROXY}inter_1.mp3`,          tags: [], kind: 'inter' },
  { id: 'green-05-19-2026', title: 'GREEN 05.19.2026',       artist: 'Village Radio', date: '05-19-2026', duration: '5:55', durationSec: 355, src: `${PROXY}green_05-19-2026.mp3`, tags: [], kind: 'mix'   },
  { id: 'inter-2b',         title: 'TRANSMISSION BREAK II',  artist: 'Village Radio', date: '',           duration: '0:20', durationSec: 20,  src: `${PROXY}inter_2.mp3`,          tags: [], kind: 'inter' },
  { id: 'red-05-20-2026',   title: 'RED 05.20.2026',         artist: 'Village Radio', date: '05-20-2026', duration: '6:31', durationSec: 391, src: `${PROXY}red_05-20-2026.mp3`,   tags: [], kind: 'mix'   },
  { id: 'inter-3b',         title: 'TRANSMISSION BREAK III', artist: 'Village Radio', date: '',           duration: '1:45', durationSec: 105, src: `${PROXY}inter_3.mp3`,          tags: [], kind: 'inter' },
  { id: 'green-05-20-2026', title: 'GREEN 05.20.2026',       artist: 'Village Radio', date: '05-20-2026', duration: '3:55', durationSec: 235, src: `${PROXY}green_05-20-2026.mp3`, tags: [], kind: 'mix'   },
];

// All mixes without interludes — used by the listen/archive page
export const mixes: Mix[] = broadcastPlaylist.filter(t => t.kind === 'mix');
