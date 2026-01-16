export interface VisualParams {
  symmetry: number; // 2 - 20
  zoom: number; // 0.1 - 5.0
  rotationSpeed: number; // -2.0 - 2.0
  colorShift: number; // 0 - 1
  detail: number; // 1 - 10 (Recursion depth simulation)
  bloom: number; // 0 - 1
  reactivity: number; // 0 - 2 (Multiplier for audio impact)
  plateShape: 'square' | 'circle' | 'polygon' | 'torus' | 'water';
  
  // 3D Spatial Controls
  position: { x: number; y: number };
  rotation: { x: number; y: number }; // Tilt
  depthDisplacement: number; // Z-axis amplitude

  // Object Seeding
  useObjectSeeding: boolean;
}

export interface AudioState {
  isPlaying: boolean;
  sourceType: 'mic' | 'file' | 'none';
  volume: number;
}

export interface AnalyzedAudio {
  bass: number; // 0-1
  mid: number; // 0-1
  high: number; // 0-1
  level: number; // 0-1 (Total energy)
  beat: boolean; // True if a transient peak is detected
  centroid: number; // Spectral centroid (0-1 range representing brightness of sound)
  dominantFreq: number; // The loudest frequency bin (Hz approx)
}

export interface DetectedObject {
  id: number;
  label: string;
  bbox: [number, number, number, number]; // [x, y, width, height]
  seedFreq: number; // Normalized 0-1 (mapped to harmonics)
  harmonicGroup: 3 | 6 | 9;
}