import * as cocoSsd from '@tensorflow-models/coco-ssd';
import '@tensorflow/tfjs';
import { DetectedObject } from '../types';

// Constants for Harmonic Scaling
const BASE_FREQ = 432;

// Assigns harmonic properties based on object semantics
const assignHarmonics = (label: string): { seedFreq: number; group: 3 | 6 | 9 } => {
  const l = label.toLowerCase();
  
  if (l.includes('person') || l.includes('face')) {
    // Human/Biological -> Group 3
    return { seedFreq: 1.0, group: 3 }; 
  }
  if (l.includes('dog') || l.includes('cat') || l.includes('bird') || l.includes('animal')) {
    // Animal/Nature -> Group 6
    return { seedFreq: 2.0, group: 6 };
  }
  if (l.includes('car') || l.includes('phone') || l.includes('tv') || l.includes('laptop')) {
    // Machine/Tech -> Group 9 (Higher complexity)
    return { seedFreq: 3.0, group: 9 };
  }
  
  // Default / Unknown
  return { seedFreq: 1.5, group: 3 };
};

export class VisionService {
  private model: cocoSsd.ObjectDetection | null = null;

  async loadModel() {
    if (!this.model) {
      try {
        console.log("Loading COCO-SSD model...");
        this.model = await cocoSsd.load();
        console.log("Model loaded.");
      } catch (err) {
        console.error("Failed to load object detection model:", err);
      }
    }
  }

  async detect(imageElement: HTMLImageElement): Promise<DetectedObject[]> {
    if (!this.model) await this.loadModel();
    if (!this.model) return [];

    try {
      const predictions = await this.model.detect(imageElement);
      
      return predictions.map((pred, index) => {
        const { seedFreq, group } = assignHarmonics(pred.class);
        return {
          id: index,
          label: pred.class,
          bbox: pred.bbox,
          seedFreq: seedFreq,
          harmonicGroup: group
        };
      });
    } catch (err) {
      console.warn("Detection failed (likely CORS or format issue):", err);
      return [];
    }
  }

  // Generates a texture where:
  // R channel = Seed Frequency (normalized 0-1)
  // G channel = Harmonic Group (normalized 0-1: 3->0.3, 6->0.6, 9->0.9)
  // B channel = Object Mask Intensity (1.0 for object)
  generateResonanceMap(objects: DetectedObject[], width: number, height: number): string {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    
    if (!ctx) return '';

    // Fill background with "Silence" (or low resonance)
    ctx.fillStyle = 'rgb(0, 0, 0)';
    ctx.fillRect(0, 0, width, height);

    // Draw objects
    // We blur them slightly to create "fields" rather than hard boxes
    ctx.filter = 'blur(20px)';
    
    objects.forEach(obj => {
      const [x, y, w, h] = obj.bbox;
      
      // Normalize values for color channels
      // Seed: arbitrary mapping, say base 1.0 -> 0.25 color val
      const r = Math.min(255, Math.floor(obj.seedFreq * 50)); 
      
      // Group: 3->85, 6->170, 9->255
      const g = Math.floor((obj.harmonicGroup / 9) * 255);
      
      // Mask: Full intensity
      const b = 255; 

      ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
      
      // Draw box
      ctx.fillRect(x, y, w, h);
    });

    return canvas.toDataURL();
  }
}