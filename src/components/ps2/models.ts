import { box, cyl, sphere, type Tri } from './mesh';

// One low-poly model per page, plus the yellow two-line title the browser shows when it's selected.
export interface IconModel { title: [string, string]; build: (t: Tri[]) => void }

const floppy = (t: Tri[]) => {
  box(t, [0, 0, 0], [1.6, 1.6, 0.14], '#1d1d24');
  box(t, [0.12, 0.5, 0.08], [0.8, 0.56, 0.03], '#b9bdc6');
  box(t, [0.3, 0.52, 0.1], [0.18, 0.36, 0.03], '#1d1d24');
  box(t, [0, -0.32, 0.08], [1.2, 0.8, 0.03], '#e9e3cc');
  box(t, [0, -0.18, 0.1], [1.0, 0.07, 0.02], '#3156a8');
  box(t, [0, -0.4, 0.1], [1.0, 0.07, 0.02], '#3156a8');
};

const cassette = (t: Tri[]) => {
  box(t, [0, 0, 0], [1.8, 1.12, 0.24], '#d8572a');
  box(t, [0, 0.12, 0.13], [1.46, 0.6, 0.03], '#f1ecdc');
  box(t, [0, 0.1, 0.15], [0.72, 0.24, 0.02], '#2a2420');
  cyl(t, [-0.42, 0.1, 0.1], [-0.42, 0.1, 0.2], 0.17, 8, '#f6f6f6', '#3a3a3a');
  cyl(t, [0.42, 0.1, 0.1], [0.42, 0.1, 0.2], 0.17, 8, '#f6f6f6', '#3a3a3a');
  box(t, [0, -0.42, 0.06], [1.1, 0.26, 0.2], '#b8461f');
};

const tv = (t: Tri[]) => {
  box(t, [0, -0.1, 0], [1.6, 1.2, 1.0], '#7b5b3e');
  box(t, [-0.15, -0.08, 0.51], [1.0, 0.82, 0.03], '#26394b');
  box(t, [-0.15, -0.08, 0.53], [0.8, 0.62, 0.02], '#4f7fa3');
  cyl(t, [0.55, 0.15, 0.48], [0.55, 0.15, 0.56], 0.09, 6, '#d8c9a0');
  cyl(t, [0.55, -0.2, 0.48], [0.55, -0.2, 0.56], 0.09, 6, '#d8c9a0');
  cyl(t, [0, 0.5, 0], [-0.55, 1.15, 0], 0.03, 4, '#c8c8c8');
  cyl(t, [0, 0.5, 0], [0.55, 1.15, 0], 0.03, 4, '#c8c8c8');
};

const camera = (t: Tri[]) => {
  box(t, [0, 0, 0], [1.7, 1.0, 0.7], '#2a2a30');
  box(t, [0, -0.32, 0.36], [1.7, 0.36, 0.03], '#7a5636');
  cyl(t, [0, -0.02, 0.35], [0, -0.02, 0.85], 0.38, 10, '#16161a', '#3c4f6e');
  cyl(t, [0, -0.02, 0.6], [0, -0.02, 0.66], 0.41, 10, '#a9adb5');
  box(t, [-0.5, 0.62, 0], [0.5, 0.26, 0.5], '#c9ccd2');
  cyl(t, [0.55, 0.5, 0], [0.55, 0.64, 0], 0.11, 8, '#c8322a');
};

const briefcase = (t: Tri[]) => {
  box(t, [0, -0.1, 0], [1.8, 1.2, 0.5], '#6b3d20');
  box(t, [0, 0.38, 0], [1.82, 0.06, 0.52], '#4a2914');
  box(t, [-0.3, 0.68, 0], [0.08, 0.36, 0.14], '#2b1a0e');
  box(t, [0.3, 0.68, 0], [0.08, 0.36, 0.14], '#2b1a0e');
  box(t, [0, 0.86, 0], [0.68, 0.08, 0.14], '#2b1a0e');
  box(t, [-0.55, 0.3, 0.27], [0.18, 0.14, 0.04], '#e1c060');
  box(t, [0.55, 0.3, 0.27], [0.18, 0.14, 0.04], '#e1c060');
};

const microphone = (t: Tri[]) => {
  sphere(t, [0, 0.55, 0], 0.5, '#a3a9b3', 5, 10);
  cyl(t, [0, 0.12, 0], [0, 0.24, 0], 0.36, 10, '#c9a648');
  cyl(t, [0, -1.1, 0], [0, 0.14, 0], 0.2, 8, '#202024');
  cyl(t, [0, -0.5, 0], [0, -0.38, 0], 0.22, 8, '#c8322a');
};

const memoryCard = (t: Tri[]) => {
  box(t, [0, 0, 0], [1.2, 1.6, 0.26], '#18181c');
  box(t, [0, 0.35, 0.14], [0.9, 0.5, 0.02], '#3a3a44');
  box(t, [0, -0.72, 0], [0.9, 0.18, 0.3], '#2a2a30');
};

export const MODELS: Record<string, IconModel> = {
  '/information': { title: ['Read Me', 'Station Notes'], build: floppy },
  '/listen':      { title: ['Listen', 'Live Feed'], build: cassette },
  '/news':        { title: ['News', 'Bulletins'], build: tv },
  '/photography': { title: ['Photography', 'Film Archive'], build: camera },
  '/work':        { title: ['Work', 'Portfolio'], build: briefcase },
  '/transmit':    { title: ['Transmit', 'Say Anything'], build: microphone },
};
export const fallbackModel = (label: string): IconModel => ({
  title: [label.charAt(0).toUpperCase() + label.slice(1), 'Village Radio'], build: memoryCard,
});
