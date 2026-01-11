import React, { useState, useEffect, useRef, useCallback } from 'react';
import * as THREE from 'three';
import { VisualizerCanvas } from './components/Visualizer';
import { Controls } from './components/Controls';
import { AudioEngine } from './services/audioEngine';
import { VisionService } from './services/visionService';
import { VisualParams, AudioState, AnalyzedAudio, DetectedObject } from './types';

// Default Parameters
const DEFAULT_PARAMS: VisualParams = {
  symmetry: 6,
  zoom: 1.0,
  rotationSpeed: 0.1,
  colorShift: 0.5,
  detail: 5,
  bloom: 0.6,
  reactivity: 1.2,
  plateShape: 'square',
  
  position: { x: 0, y: 0 },
  rotation: { x: 0, y: 0 },
  depthDisplacement: 0.5,
  useObjectSeeding: false,
};

const App: React.FC = () => {
  const [params, setParams] = useState<VisualParams>(DEFAULT_PARAMS);
  const [audioState, setAudioState] = useState<AudioState>({
    isPlaying: false,
    sourceType: 'none',
    volume: 1.0,
  });
  const [userTexture, setUserTexture] = useState<THREE.Texture | null>(null);
  const [resonanceTexture, setResonanceTexture] = useState<THREE.Texture | null>(null);
  const [detectedObjects, setDetectedObjects] = useState<DetectedObject[]>([]);
  const [visionStatus, setVisionStatus] = useState<string>('');

  // Services Refs
  const audioEngine = useRef<AudioEngine | null>(null);
  const visionService = useRef<VisionService | null>(null);

  if (!audioEngine.current) {
    audioEngine.current = new AudioEngine({});
  }
  if (!visionService.current) {
    visionService.current = new VisionService();
    // Preload model silently
    visionService.current.loadModel();
  }

  const audioDataRef = useRef<AnalyzedAudio>({ 
    bass: 0, mid: 0, high: 0, level: 0, beat: false, centroid: 0, dominantFreq: 0
  });
  const animationFrameRef = useRef<number>(0);

  const animate = useCallback(() => {
    if (audioEngine.current) {
      const data = audioEngine.current.getAnalysis();
      audioDataRef.current = data;
    }
    animationFrameRef.current = requestAnimationFrame(animate);
  }, []);

  useEffect(() => {
    animationFrameRef.current = requestAnimationFrame(animate);
    return () => {
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
      if (audioEngine.current) audioEngine.current.cleanup();
    };
  }, [animate]);

  const handleMicEnable = async () => {
    if (!audioEngine.current) return;
    try {
      await audioEngine.current.initMic();
      setAudioState(prev => ({ ...prev, sourceType: 'mic', isPlaying: true }));
    } catch (e) {
      console.error("Mic access denied", e);
      alert("Microphone access is required for live visualization.");
    }
  };

  const handleFileChange = async (file: File) => {
    if (!audioEngine.current) return;
    try {
      await audioEngine.current.initFile(file);
      setAudioState(prev => ({ ...prev, sourceType: 'file', isPlaying: true }));
    } catch (e) {
      console.error("Error playing file", e);
    }
  };

  const handleStopAudio = async () => {
    if (!audioEngine.current) return;
    await audioEngine.current.cleanup();
    setAudioState(prev => ({ ...prev, sourceType: 'none', isPlaying: false }));
  };

  const handleImageChange = (file: File) => {
    setVisionStatus('Analysing...');
    const url = URL.createObjectURL(file);
    
    // Load Texture for Visuals
    const loader = new THREE.TextureLoader();
    loader.load(url, (texture) => {
      setUserTexture(texture);
    });

    // Run Vision Analysis
    const img = new Image();
    img.src = url;
    img.onload = async () => {
        if (visionService.current) {
            const objects = await visionService.current.detect(img);
            setDetectedObjects(objects);
            
            if (objects.length > 0) {
                const mapDataUrl = visionService.current.generateResonanceMap(objects, img.width, img.height);
                new THREE.TextureLoader().load(mapDataUrl, (resTex) => {
                    setResonanceTexture(resTex);
                    setParams(p => ({...p, useObjectSeeding: true})); // Auto-enable if detected
                });
                setVisionStatus(`Found ${objects.length} resonant objects.`);
            } else {
                setVisionStatus('No specific objects detected.');
                setResonanceTexture(null);
            }
        }
    };
  };

  return (
    <div className="relative w-full h-screen bg-black overflow-hidden">
      
      {/* 3D Visualizer Layer */}
      <div className="absolute inset-0 z-0">
        <VisualizerCanvas 
          params={params} 
          audioData={audioDataRef} 
          userTexture={userTexture}
          resonanceTexture={resonanceTexture} 
        />
      </div>

      {/* UI Controls Layer */}
      <Controls
        params={params}
        setParams={setParams}
        audioState={audioState}
        onMicEnable={handleMicEnable}
        onFileChange={handleFileChange}
        onImageChange={handleImageChange}
        onStopAudio={handleStopAudio}
      />
      
      {/* Footer / Status */}
      <div className="absolute bottom-4 left-4 z-10 text-white/30 text-xs pointer-events-none font-mono flex flex-col gap-1">
        <span>AetherGeometry v3.2 • 3D Cymatic Engine</span>
        {visionStatus && <span className="text-indigo-400">{visionStatus}</span>}
      </div>
    </div>
  );
};

export default App;