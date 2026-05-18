'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

export type RecorderState = 'idle' | 'armed' | 'recording' | 'review' | 'error';

export interface RecorderApi {
  state: RecorderState;
  start: () => Promise<void>;
  stop: () => void;
  reset: () => void;
  blob: Blob | null;
  duration: number;
  peakLevel: number;
  analyser: AnalyserNode | null;
  error: string | null;
}

const MAX_DURATION_SECONDS = 180;
const PREFERRED_MIME = 'audio/webm; codecs=opus';
const FALLBACK_MIME = 'audio/webm';

export function useRecorder(): RecorderApi {
  const [state, setState] = useState<RecorderState>('idle');
  const [blob, setBlob] = useState<Blob | null>(null);
  const [duration, setDuration] = useState(0);
  const [peakLevel, setPeakLevel] = useState(0);
  const [analyser, setAnalyser] = useState<AnalyserNode | null>(null);
  const [error, setError] = useState<string | null>(null);

  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const rafRef = useRef<number>(0);
  const startedAtRef = useRef<number>(0);
  const stopTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancelledRef = useRef(false);

  const cleanup = useCallback(() => {
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = 0;
    }
    if (stopTimeoutRef.current) {
      clearTimeout(stopTimeoutRef.current);
      stopTimeoutRef.current = null;
    }
    if (recorderRef.current && recorderRef.current.state !== 'inactive') {
      cancelledRef.current = true;
      try { recorderRef.current.stop(); } catch { /* ignore */ }
    }
    recorderRef.current = null;
    if (sourceRef.current) {
      try { sourceRef.current.disconnect(); } catch { /* ignore */ }
      sourceRef.current = null;
    }
    if (analyserRef.current) {
      try { analyserRef.current.disconnect(); } catch { /* ignore */ }
      analyserRef.current = null;
    }
    if (audioCtxRef.current) {
      audioCtxRef.current.close().catch(() => { /* ignore */ });
      audioCtxRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    setAnalyser(null);
  }, []);

  const tickLevel = useCallback(() => {
    const a = analyserRef.current;
    if (!a) return;
    const buf = new Float32Array(a.fftSize);
    a.getFloatTimeDomainData(buf);
    let peak = 0;
    for (let i = 0; i < buf.length; i++) {
      const v = Math.abs(buf[i]);
      if (v > peak) peak = v;
    }
    setPeakLevel(peak);
    setDuration((performance.now() - startedAtRef.current) / 1000);
    rafRef.current = requestAnimationFrame(tickLevel);
  }, []);

  const stop = useCallback(() => {
    if (recorderRef.current && recorderRef.current.state === 'recording') {
      recorderRef.current.stop();
    }
  }, []);

  const start = useCallback(async () => {
    cancelledRef.current = false;
    setError(null);
    setBlob(null);
    setDuration(0);
    setPeakLevel(0);

    if (typeof window === 'undefined' || typeof MediaRecorder === 'undefined') {
      setError('This browser does not support audio recording.');
      setState('error');
      return;
    }

    try {
      setState('armed');
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new Ctx();
      audioCtxRef.current = ctx;
      const source = ctx.createMediaStreamSource(stream);
      const a = ctx.createAnalyser();
      a.fftSize = 2048;
      a.smoothingTimeConstant = 0.6;
      source.connect(a);
      sourceRef.current = source;
      analyserRef.current = a;
      setAnalyser(a);

      const canCheckType = typeof MediaRecorder.isTypeSupported === 'function';
      const mimeType = canCheckType && MediaRecorder.isTypeSupported(PREFERRED_MIME)
        ? PREFERRED_MIME
        : canCheckType && MediaRecorder.isTypeSupported(FALLBACK_MIME)
        ? FALLBACK_MIME
        : '';

      // Server only accepts audio/webm; bail out cleanly instead of recording an mp4 we'll reject on upload
      if (!mimeType) {
        setError('This browser does not support webm recording. Try Chrome or Firefox.');
        setState('error');
        cleanup();
        return;
      }

      const recorder = new MediaRecorder(stream, { mimeType, audioBitsPerSecond: 64000 });
      recorderRef.current = recorder;
      chunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = () => {
        if (cancelledRef.current) return;
        if (rafRef.current) {
          cancelAnimationFrame(rafRef.current);
          rafRef.current = 0;
        }
        if (stopTimeoutRef.current) {
          clearTimeout(stopTimeoutRef.current);
          stopTimeoutRef.current = null;
        }
        const finalBlob = new Blob(chunksRef.current, { type: chunksRef.current[0]?.type || 'audio/webm' });
        setBlob(finalBlob);
        setDuration((performance.now() - startedAtRef.current) / 1000);
        if (streamRef.current) {
          streamRef.current.getTracks().forEach(t => t.stop());
          streamRef.current = null;
        }
        setState('review');
      };
      recorder.onerror = () => { setError('Recording failed.'); setState('error'); cleanup(); };

      startedAtRef.current = performance.now();
      recorder.start(250);
      setState('recording');
      rafRef.current = requestAnimationFrame(tickLevel);

      stopTimeoutRef.current = setTimeout(() => {
        if (recorderRef.current && recorderRef.current.state === 'recording') {
          recorderRef.current.stop();
        }
      }, MAX_DURATION_SECONDS * 1000);
    } catch (err) {
      const msg = err instanceof Error && err.name === 'NotAllowedError'
        ? 'Microphone access denied — enable it in your browser settings.'
        : 'Could not start recording.';
      setError(msg);
      setState('error');
      cleanup();
    }
  }, [cleanup, tickLevel]);

  const reset = useCallback(() => {
    cleanup();
    setBlob(null);
    setDuration(0);
    setPeakLevel(0);
    setError(null);
    setState('idle');
  }, [cleanup]);

  useEffect(() => () => cleanup(), [cleanup]);

  return { state, start, stop, reset, blob, duration, peakLevel, analyser, error };
}
