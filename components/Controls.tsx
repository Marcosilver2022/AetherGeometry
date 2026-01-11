import React, { useRef } from 'react';
import { VisualParams, AudioState } from '../types';
import { generateVisualPreset } from '../services/geminiService';

interface ControlsProps {
  params: VisualParams;
  setParams: React.Dispatch<React.SetStateAction<VisualParams>>;
  audioState: AudioState;
  onFileChange: (file: File) => void;
  onImageChange: (file: File) => void;
  onMicEnable: () => void;
  onStopAudio: () => void;
}

const Slider: React.FC<{
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (val: number) => void;
}> = ({ label, value, min, max, step, onChange }) => (
  <div className="mb-3">
    <div className="flex justify-between text-xs text-gray-400 mb-1">
      <span>{label}</span>
      <span>{value.toFixed(2)}</span>
    </div>
    <input
      type="range"
      min={min}
      max={max}
      step={step}
      value={value}
      onChange={(e) => onChange(parseFloat(e.target.value))}
      className="w-full h-1 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-indigo-500 hover:accent-indigo-400 transition-all"
    />
  </div>
);

export const Controls: React.FC<ControlsProps> = ({
  params,
  setParams,
  audioState,
  onFileChange,
  onImageChange,
  onMicEnable,
  onStopAudio
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imgInputRef = useRef<HTMLInputElement>(null);
  const [loadingAi, setLoadingAi] = React.useState(false);

  const handleAiHarmonize = async () => {
    setLoadingAi(true);
    const presets = await generateVisualPreset("Ethereal, complex, Chladni plate, scientific, high energy");
    if (presets) {
      setParams(prev => ({ ...prev, ...presets }));
    }
    setLoadingAi(false);
  };

  return (
    <div className="absolute top-0 right-0 h-full w-80 bg-black/80 backdrop-blur-md border-l border-white/10 p-6 overflow-y-auto z-10 transition-transform">
      <h1 className="text-2xl font-light text-white mb-6 tracking-widest">AETHER<span className="text-indigo-400 font-bold">CYMATICS</span></h1>

      {/* Audio Sources */}
      <div className="mb-8">
        <h3 className="text-xs uppercase font-bold text-gray-500 mb-3 tracking-wider">Audio Source</h3>
        <div className="grid grid-cols-2 gap-2 mb-2">
           <button
            onClick={onMicEnable}
            className={`p-2 text-sm rounded border ${audioState.sourceType === 'mic' ? 'bg-indigo-600 border-indigo-500 text-white' : 'border-gray-700 text-gray-400 hover:border-gray-500'}`}
          >
            Use Microphone
          </button>
          <button
            onClick={() => fileInputRef.current?.click()}
            className={`p-2 text-sm rounded border ${audioState.sourceType === 'file' ? 'bg-indigo-600 border-indigo-500 text-white' : 'border-gray-700 text-gray-400 hover:border-gray-500'}`}
          >
            Upload File
          </button>
          <input
            type="file"
            ref={fileInputRef}
            onChange={(e) => e.target.files?.[0] && onFileChange(e.target.files[0])}
            className="hidden"
            accept="audio/*"
          />
        </div>
        {audioState.sourceType !== 'none' && (
           <button onClick={onStopAudio} className="w-full mt-2 p-1 text-xs text-red-400 border border-red-900/30 bg-red-900/10 rounded hover:bg-red-900/30">
             Stop Audio
           </button>
        )}
      </div>

      {/* Image Upload */}
      <div className="mb-8">
        <h3 className="text-xs uppercase font-bold text-gray-500 mb-3 tracking-wider">Visual Texture</h3>
        <button
          onClick={() => imgInputRef.current?.click()}
          className="w-full p-2 text-sm rounded border border-gray-700 text-gray-300 hover:border-gray-500 hover:text-white transition-colors flex items-center justify-center gap-2"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
          Upload Image Texture
        </button>
        <input
            type="file"
            ref={imgInputRef}
            onChange={(e) => e.target.files?.[0] && onImageChange(e.target.files[0])}
            className="hidden"
            accept="image/*"
          />
      </div>

       {/* AI Button */}
       <div className="mb-8">
        <button
            onClick={handleAiHarmonize}
            disabled={loadingAi}
            className="w-full relative group overflow-hidden p-3 rounded bg-gradient-to-r from-purple-900 to-indigo-900 border border-indigo-700 text-white font-medium hover:shadow-[0_0_20px_rgba(79,70,229,0.5)] transition-all"
        >
            <span className="relative z-10 flex items-center justify-center gap-2">
                {loadingAi ? (
                    <span className="animate-pulse">Calculated Resonance...</span>
                ) : (
                    <>
                        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2L9 9l-7 3 7 3 3 7 3-7 7-3-7-3z" /></svg>
                        AI Resonance
                    </>
                )}
            </span>
        </button>
       </div>

      {/* 3D Spatial Controls */}
      <div className="mb-8">
        <h3 className="text-xs uppercase font-bold text-gray-500 mb-3 tracking-wider">Spatial & 3D</h3>
        
        <Slider
          label="Position X"
          value={params.position.x}
          min={-2}
          max={2}
          step={0.01}
          onChange={(v) => setParams(p => ({ ...p, position: { ...p.position, x: v } }))}
        />
        <Slider
          label="Position Y"
          value={params.position.y}
          min={-2}
          max={2}
          step={0.01}
          onChange={(v) => setParams(p => ({ ...p, position: { ...p.position, y: v } }))}
        />
        <Slider
          label="Tilt X"
          value={params.rotation.x}
          min={-1.5}
          max={1.5}
          step={0.01}
          onChange={(v) => setParams(p => ({ ...p, rotation: { ...p.rotation, x: v } }))}
        />
        <Slider
          label="Tilt Y"
          value={params.rotation.y}
          min={-1.5}
          max={1.5}
          step={0.01}
          onChange={(v) => setParams(p => ({ ...p, rotation: { ...p.rotation, y: v } }))}
        />
         <Slider
          label="Z-Depth (Cymatic Relief)"
          value={params.depthDisplacement}
          min={0}
          max={2.0}
          step={0.01}
          onChange={(v) => setParams(p => ({ ...p, depthDisplacement: v }))}
        />
      </div>

      {/* Physics Parameters */}
      <div className="mb-8">
        <h3 className="text-xs uppercase font-bold text-gray-500 mb-3 tracking-wider">Physics & Modes</h3>
        
        <div className="mb-4">
            <label className="text-xs text-gray-400 mb-1 block">Plate Shape</label>
            <div className="flex rounded border border-gray-700 overflow-hidden">
                <button 
                    onClick={() => setParams(p => ({...p, plateShape: 'square'}))}
                    className={`flex-1 p-2 text-[10px] uppercase font-bold ${params.plateShape === 'square' ? 'bg-indigo-600 text-white' : 'bg-transparent text-gray-400'}`}
                >
                    Square
                </button>
                <button 
                    onClick={() => setParams(p => ({...p, plateShape: 'circle'}))}
                    className={`flex-1 p-2 text-[10px] uppercase font-bold ${params.plateShape === 'circle' ? 'bg-indigo-600 text-white' : 'bg-transparent text-gray-400'}`}
                >
                    Circle
                </button>
                <button 
                    onClick={() => setParams(p => ({...p, plateShape: 'polygon'}))}
                    className={`flex-1 p-2 text-[10px] uppercase font-bold ${params.plateShape === 'polygon' ? 'bg-indigo-600 text-white' : 'bg-transparent text-gray-400'}`}
                >
                    Poly
                </button>
                 <button 
                    onClick={() => setParams(p => ({...p, plateShape: 'torus'}))}
                    className={`flex-1 p-2 text-[10px] uppercase font-bold ${params.plateShape === 'torus' ? 'bg-indigo-600 text-white' : 'bg-transparent text-gray-400'}`}
                >
                    Torus
                </button>
            </div>
        </div>

        <div className="mb-4 flex items-center justify-between">
            <span className="text-xs text-gray-400">Object Seeding</span>
            <button 
                onClick={() => setParams(p => ({...p, useObjectSeeding: !p.useObjectSeeding}))}
                className={`text-xs px-2 py-1 rounded ${params.useObjectSeeding ? 'bg-indigo-600 text-white' : 'bg-gray-700 text-gray-400'}`}
            >
                {params.useObjectSeeding ? 'Active' : 'Off'}
            </button>
        </div>

        <Slider
          label="Symmetry Bias"
          value={params.symmetry}
          min={2}
          max={20}
          step={1}
          onChange={(v) => setParams(p => ({ ...p, symmetry: v }))}
        />
        <Slider
          label="Zoom Scale"
          value={params.zoom}
          min={0.5}
          max={3.0}
          step={0.01}
          onChange={(v) => setParams(p => ({ ...p, zoom: v }))}
        />
         <Slider
          label="Complexity (Recursion)"
          value={params.detail}
          min={1}
          max={10}
          step={0.1}
          onChange={(v) => setParams(p => ({ ...p, detail: v }))}
        />
      </div>

      <div className="mb-8">
        <h3 className="text-xs uppercase font-bold text-gray-500 mb-3 tracking-wider">Reactivity</h3>
         <Slider
          label="Amplitude"
          value={params.reactivity}
          min={0}
          max={3.0}
          step={0.1}
          onChange={(v) => setParams(p => ({ ...p, reactivity: v }))}
        />
        <Slider
          label="Rotation"
          value={params.rotationSpeed}
          min={-1.0}
          max={1.0}
          step={0.05}
          onChange={(v) => setParams(p => ({ ...p, rotationSpeed: v }))}
        />
        <Slider
          label="Color Shift"
          value={params.colorShift}
          min={0}
          max={1}
          step={0.01}
          onChange={(v) => setParams(p => ({ ...p, colorShift: v }))}
        />
         <Slider
          label="Bloom Intensity"
          value={params.bloom}
          min={0}
          max={2}
          step={0.01}
          onChange={(v) => setParams(p => ({ ...p, bloom: v }))}
        />
      </div>
    </div>
  );
};