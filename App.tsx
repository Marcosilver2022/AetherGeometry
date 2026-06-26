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
  codexGain: 0.65,
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
  const videoElementRef = useRef<HTMLVideoElement | null>(null);
  const mediaTextureUrlRef = useRef<string | null>(null);
  
  // Recording State
  const [isRecording, setIsRecording] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

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
      if (videoElementRef.current) {
        videoElementRef.current.pause();
        videoElementRef.current.src = '';
      }
      if (mediaTextureUrlRef.current) URL.revokeObjectURL(mediaTextureUrlRef.current);
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

  const resetMediaTextureUrl = () => {
    if (mediaTextureUrlRef.current) {
      URL.revokeObjectURL(mediaTextureUrlRef.current);
      mediaTextureUrlRef.current = null;
    }
  };

  const handleImageChange = (file: File) => {
    setVisionStatus('Analysing image...');
    if (videoElementRef.current) {
      videoElementRef.current.pause();
      videoElementRef.current.src = '';
      videoElementRef.current = null;
    }
    resetMediaTextureUrl();
    const url = URL.createObjectURL(file);
    mediaTextureUrlRef.current = url;
    
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

  const handleVideoChange = (file: File) => {
    setVisionStatus('Loading video texture...');
    if (videoElementRef.current) {
      videoElementRef.current.pause();
      videoElementRef.current.src = '';
    }
    resetMediaTextureUrl();

    const url = URL.createObjectURL(file);
    mediaTextureUrlRef.current = url;

    const video = document.createElement('video');
    video.src = url;
    video.loop = true;
    video.muted = true;
    video.playsInline = true;
    video.crossOrigin = 'anonymous';
    videoElementRef.current = video;

    video.onloadeddata = async () => {
      const videoTexture = new THREE.VideoTexture(video);
      videoTexture.colorSpace = THREE.SRGBColorSpace;
      videoTexture.minFilter = THREE.LinearFilter;
      videoTexture.magFilter = THREE.LinearFilter;
      videoTexture.wrapS = THREE.MirroredRepeatWrapping;
      videoTexture.wrapT = THREE.MirroredRepeatWrapping;

      setUserTexture(videoTexture);
      setResonanceTexture(null);
      setDetectedObjects([]);
      setParams(p => ({ ...p, useObjectSeeding: false }));
      setVisionStatus(`Video texture active: ${file.name}`);

      try {
        await video.play();
      } catch (e) {
        console.warn('Video autoplay was blocked until user interaction.', e);
        setVisionStatus(`Video texture loaded: ${file.name}. Click the page if playback pauses.`);
      }
    };

    video.onerror = () => {
      setVisionStatus('Video texture failed to load. Try another format.');
    };
  };

  // --- RECORDING HANDLERS ---
  const handleCanvasCreated = (canvas: HTMLCanvasElement) => {
    canvasRef.current = canvas;
  }

  const handleStartRecording = () => {
    if (!canvasRef.current) {
        console.error("Canvas not found for recording.");
        return;
    }
    
    // Capture Canvas Stream (30 FPS)
    const canvasStream = canvasRef.current.captureStream(30);
    
    // Get Audio Stream if available
    const audioStream = audioEngine.current?.getStream();
    
    // Combine tracks
    const combinedTracks = [
        ...canvasStream.getVideoTracks(),
        ...(audioStream ? audioStream.getAudioTracks() : [])
    ];
    const combinedStream = new MediaStream(combinedTracks);

    try {
        const recorder = new MediaRecorder(combinedStream, { 
            mimeType: 'video/webm; codecs=vp9' 
        });
        
        recordedChunksRef.current = [];
        
        recorder.ondataavailable = (e) => { 
            if (e.data.size > 0) {
                recordedChunksRef.current.push(e.data); 
            }
        };
        
        recorder.onstop = () => {
            const blob = new Blob(recordedChunksRef.current, { type: 'video/webm' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `cymatics-export-${Date.now()}.webm`;
            a.click();
            URL.revokeObjectURL(url);
            recordedChunksRef.current = [];
        };
        
        recorder.start();
        mediaRecorderRef.current = recorder;
        setIsRecording(true);
        
    } catch (e) {
        console.error("Failed to start MediaRecorder:", e);
        alert("Video recording failed. Your browser may not support the required format.");
    }
  };

  const handleStopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.stop();
        setIsRecording(false);
    }
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
          onCanvasCreated={handleCanvasCreated}
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
        onVideoChange={handleVideoChange}
        onStopAudio={handleStopAudio}
        isRecording={isRecording}
        onStartRecording={handleStartRecording}
        onStopRecording={handleStopRecording}
      />
      
      {/* Footer / Status */}
      <div className="absolute bottom-4 left-4 z-10 text-white/30 text-xs pointer-events-none font-mono flex flex-col gap-1">
        <span>AetherGeometry v3.3 • Codex-refined 3D Cymatic Engine</span>
        {visionStatus && <span className="text-indigo-400">{visionStatus}</span>}
      </div>
    </div>
  );
};

export default App;