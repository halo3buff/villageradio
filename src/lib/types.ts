export interface Mix {
  id: string;
  title: string;
  artist: string;
  date: string;
  duration: string;
  durationSec?: number;
  src: string;
  cover?: string;
  tags: string[];
  kind?: 'mix' | 'inter';
}

export interface WorkItem {
  id: string;
  title: string;
  client?: string;
  year: number;
  category: 'branding' | 'print' | 'motion' | 'identity';
  images: string[];
  description?: string;
}

export interface Photo {
  id: string;
  src: string;
  caption?: string;
  date?: string;
  series?: string;
}
