'use client';
import { createContext, useContext, useRef, useState } from 'react';
import type { Mix } from '@/lib/types';

interface AudioCtx {
  currentTrack: Mix | null;
  isPlaying: boolean;
  play: (track: Mix) => void;
  pause: () => void;
  toggle: () => void;
  progress: number;
}

const AudioContext = createContext<AudioCtx | null>(null);

export function AudioProvider({ children }: { children: React.ReactNode }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [currentTrack, setCurrentTrack] = useState<Mix | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);

  function play(track: Mix) {
    if (!audioRef.current) audioRef.current = new Audio();
    audioRef.current.src = track.src;
    audioRef.current.play();
    audioRef.current.ontimeupdate = () => {
      const a = audioRef.current!;
      setProgress(a.currentTime / a.duration || 0);
    };
    audioRef.current.onended = () => setIsPlaying(false);
    setCurrentTrack(track);
    setIsPlaying(true);
  }

  function pause() {
    audioRef.current?.pause();
    setIsPlaying(false);
  }

  function toggle() {
    if (isPlaying) {
      pause();
    } else {
      audioRef.current?.play();
      setIsPlaying(true);
    }
  }

  return (
    <AudioContext.Provider value={{ currentTrack, isPlaying, play, pause, toggle, progress }}>
      {children}
    </AudioContext.Provider>
  );
}

export function useAudio() {
  const ctx = useContext(AudioContext);
  if (!ctx) throw new Error('useAudio must be used within AudioProvider');
  return ctx;
}
