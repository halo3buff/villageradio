import type { Mix } from '@/lib/types';

export const broadcastPlaylist: Mix[] = [
  {
    id: 'mix-1',
    title: 'BROADCAST I',
    artist: 'Village Radio',
    date: '',
    duration: '',
    src: '/audio/mix_1.mp3',
    tags: [],
    kind: 'mix',
  },
  {
    id: 'inter-1',
    title: 'TRANSMISSION BREAK I',
    artist: 'Village Radio',
    date: '',
    duration: '',
    src: '/audio/inter_1.mp3',
    tags: [],
    kind: 'inter',
  },
  {
    id: 'mix-2',
    title: 'BROADCAST II',
    artist: 'Village Radio',
    date: '',
    duration: '',
    src: '/audio/mix_2.mp3',
    tags: [],
    kind: 'mix',
  },
  {
    id: 'inter-2',
    title: 'TRANSMISSION BREAK II',
    artist: 'Village Radio',
    date: '',
    duration: '',
    src: '/audio/inter_2.mp3',
    tags: [],
    kind: 'inter',
  },
  {
    id: 'mix-3',
    title: 'BROADCAST III',
    artist: 'Village Radio',
    date: '',
    duration: '',
    src: '/audio/mix_3.mp3',
    tags: [],
    kind: 'mix',
  },
];

// Alias for backward compatibility
export const mixes = broadcastPlaylist;
