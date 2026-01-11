import React, { useRef, useMemo, useEffect } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { VisualParams, AnalyzedAudio } from '../types';

// Fix for JSX element type errors
declare module 'react' {
  namespace JSX {
    interface IntrinsicElements {
      mesh: any;
      planeGeometry: any;
      torusGeometry: any;
      shaderMaterial: any;
      points: any;
      bufferGeometry: any;
      bufferAttribute: any;
    }
  }
}

// --- SHARED PHYSICS MATH (GLSL) ---
const chladniMath = `
#define PI 3.14159265359

float chladniSquare(vec2 uv, float n, float m) {
    float x = uv.x * PI;
    float y = uv.y * PI;
    return cos(n * x) * cos(m * y) - cos(m * x) * cos(n * y);
}

float chladniCircle(vec2 uv, float n, float m) {
    vec2 centered = uv - 0.5;
    float r = length(centered) * 2.0; 
    float theta = atan(centered.y, centered.x);
    return sin(n * PI * r) * cos(m * theta);
}

float chladniPolygon(vec2 uv, float n, float m) {
    vec2 p = (uv - 0.5) * 2.0;
    float a = 0.0;
    float freq = n + 1.0;
    for (float i = 0.0; i < 3.0; i++) {
        float angle = PI * i / 3.0;
        vec2 dir = vec2(cos(angle), sin(angle));
        a += cos(dot(p, dir) * freq * PI + m);
    }
    return a;
}

vec2 toroidalCoords(vec3 p, float R) {
    float theta = atan(p.y, p.x);      
    float r = length(vec2(p.x, p.y)) - R;
    float phi = atan(p.z, r);          
    return vec2(theta, phi);
}

float chladniTorus(vec2 tp, float n, float m) {
    return sin(n * tp.x) * sin(m * tp.y);
}

// --- NEW: Object Field Binding ---
// uv: coordinates
// seed: from texture R channel (normalized freq)
// group: from texture G channel (harmonic group)
// energy: audio band energy
float objectField(vec2 uv, float seed, float group, float energy, float time, float beatPhase) {
    // 3-6-9 Harmonic Logic
    float m = (group * 3.0) + (energy * 6.0);
    float n = (group * 6.0) + (energy * 6.0);
    
    // Seed determines the base phase/drift speed
    float drift = time * (seed * 2.0);
    
    // Beat Phase injects symmetry jumps
    float phase = drift + beatPhase;
    
    // Toroidal-like equation but in 2D space for the mask region
    return sin(m * uv.x + phase) * sin(n * uv.y - phase);
}

vec2 rotate(vec2 v, float a) {
	float s = sin(a);
	float c = cos(a);
	mat2 m = mat2(c, -s, s, c);
	return m * v;
}
`;

// --- VERTEX SHADER ---
const vertexShaderCymatic = `
varying vec2 vUv;
varying float vEnergy; 
uniform float uTime;
uniform float uBass;
uniform float uMid;
uniform float uHigh;
uniform float uReactivity;
uniform float uDepthDisplacement; 
uniform float uModeM;
uniform float uModeN;
uniform int uPlateShape;
uniform float uZoom;
uniform sampler2D uResonanceMap; // The AI Object Mask
uniform bool uUseObjectSeeding;
uniform float uBeatCumulative; // Accumulates on beat hits

${chladniMath}

vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec2 mod289(vec2 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec3 permute(vec3 x) { return mod289(((x*34.0)+1.0)*x); }
float snoise(vec2 v) {
  const vec4 C = vec4(0.211324865405187, 0.366025403784439, -0.577350269189626, 0.024390243902439);
  vec2 i  = floor(v + dot(v, C.yy) );
  vec2 x0 = v -   i + dot(i, C.xx);
  vec2 i1;
  i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
  vec4 x12 = x0.xyxy + C.xxzz;
  x12.xy -= i1;
  i = mod289(i);
  vec3 p = permute( permute( i.y + vec3(0.0, i1.y, 1.0 )) + i.x + vec3(0.0, i1.x, 1.0 ));
  vec3 m = max(0.5 - vec3(dot(x0,x0), dot(x12.xy,x12.xy), dot(x12.zw,x12.zw)), 0.0);
  m = m*m ; m = m*m ;
  vec3 x = 2.0 * fract(p * C.www) - 1.0;
  vec3 h = abs(x) - 0.5;
  vec3 ox = floor(x + 0.5);
  vec3 a0 = x - ox;
  m *= 1.79284291400159 - 0.85373472095314 * ( a0*a0 + h*h );
  vec3 g;
  g.x  = a0.x  * x0.x  + h.x  * x0.y;
  g.yz = a0.yz * x12.xz + h.yz * x12.yw;
  return 130.0 * dot(m, g);
}

void main() {
  vUv = uv;
  vec3 pos = position;
  vec3 objectNormal = normal;
  
  vec2 aspectUV = (uv - 0.5);
  aspectUV = aspectUV * uZoom + 0.5;
  
  vec2 centered = aspectUV - 0.5;
  centered = rotate(centered, uTime * 0.05); 
  vec2 finalUV = centered + 0.5;

  // --- Calculate Base Cymatic Field (Global) ---
  float pattern = 0.0;
  float baseN = uModeN;
  float baseM = uModeM;
  
  // Standard Geometry Logic
  if (uPlateShape == 0) { // SQUARE
      pattern += chladniSquare(finalUV, baseN, baseM) * (0.6 + uBass);
      pattern += chladniSquare(finalUV, baseN * 1.5, baseM + 2.0) * uMid;
  } else if (uPlateShape == 1) { // CIRCLE
      pattern += chladniCircle(finalUV, baseN, baseM) * (0.6 + uBass);
      pattern += chladniCircle(finalUV, baseN + 2.0, baseM * 2.0) * uMid;
  } else if (uPlateShape == 2) { // POLYGON
      pattern += chladniPolygon(finalUV, baseN, baseM) * (0.6 + uBass);
      pattern += chladniPolygon(finalUV, baseN + 1.0, baseM + uTime) * uMid;
  } else if (uPlateShape == 3) { // TORUS
      vec2 tp = toroidalCoords(pos, 1.0);
      pattern += chladniTorus(tp, baseN * 2.0, baseM * 2.0) * (0.6 + uBass);
      pattern += chladniTorus(tp, baseN * 3.0, baseM * 3.0 + uTime) * uMid;
  }

  // --- OBJECT SEEDING LOGIC ---
  if (uUseObjectSeeding) {
      // Sample the resonance map (AI Mask)
      vec4 resData = texture2D(uResonanceMap, vUv); // Note: using vUv (screen space) for overlay mapping
      
      float seedFreq = resData.r * 10.0; // Scaled up
      float harmonicGroup = resData.g * 10.0; // Scaled (e.g. 0.3 -> 3.0)
      float maskIntensity = resData.b;
      
      if (maskIntensity > 0.1) {
          // This pixel is inside a detected object
          // Generate localized object field
          float objPat = objectField(finalUV, seedFreq, harmonicGroup, uBass + uMid, uTime, uBeatCumulative);
          
          // Blend: Audio Bass drives how much the object "takes over"
          // Beat hits make the object pattern dominant
          float blend = maskIntensity * (0.5 + uBass * 0.5);
          
          pattern = mix(pattern, objPat, blend);
      }
  }
  
  float noiseDetail = snoise(finalUV * 15.0 + uTime) * (uHigh * 0.2);
  float energy = abs(pattern) + noiseDetail;
  vEnergy = energy;
  
  float zDisp = energy * uDepthDisplacement * uReactivity;
  pos += objectNormal * zDisp;
  
  gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
}
`;

const fragmentShaderCymatic = `
uniform float uTime;
uniform sampler2D uTexture;
uniform float uColorShift;
uniform float uBloom;
uniform float uReactivity;
uniform bool uHasTexture;
uniform float uHigh;

varying vec2 vUv;
varying float vEnergy; 

vec3 palette( in float t, in vec3 a, in vec3 b, in vec3 c, in vec3 d ) {
    return a + b*cos( 6.28318*(c*t+d) );
}

void main() {
    float vibration = vEnergy; 
    
    float nodalLine = 1.0 - smoothstep(0.01, 0.08 + uHigh * 0.1, vibration);
    float antinode = smoothstep(0.2, 1.0, vibration);

    vec3 col = vec3(0.0);
    vec3 pCol = palette(vibration * 0.5 + uColorShift + uTime*0.1, 
                        vec3(0.5), vec3(0.5), vec3(1.0), vec3(0.0, 0.33, 0.67));

    if (uHasTexture) {
        vec3 texColor = texture2D(uTexture, vUv).rgb;
        col = texColor;
        vec3 sandColor = vec3(0.9, 0.9, 0.8);
        col = mix(col, sandColor, nodalLine * 0.6);
        col += pCol * antinode * uBloom * uReactivity;
    } else {
        col = vec3(0.02, 0.02, 0.05); 
        col += pCol * vibration * uBloom * 1.5;
        col += vec3(1.0) * nodalLine * 0.6;
    }

    gl_FragColor = vec4(col, 1.0);
}
`;

interface SceneProps {
  params: VisualParams;
  audioData: React.MutableRefObject<AnalyzedAudio>;
  userTexture: THREE.Texture | null;
  resonanceTexture: THREE.Texture | null;
}

const CymaticPlate: React.FC<SceneProps> = ({ params, audioData, userTexture, resonanceTexture }) => {
  const meshRef = useRef<THREE.Mesh>(null);
  const materialRef = useRef<THREE.ShaderMaterial>(null);
  const { size } = useThree();
  const timeRef = useRef(0);
  const beatCumulativeRef = useRef(0);
  
  const physicsRef = useRef({ m: 2, n: 2 });

  const uniforms = useMemo(() => ({
    uTime: { value: 0 },
    uResolution: { value: new THREE.Vector2(size.width, size.height) },
    uTexture: { value: null },
    uHasTexture: { value: false },
    uZoom: { value: params.zoom },
    uBass: { value: 0 },
    uMid: { value: 0 },
    uHigh: { value: 0 },
    uColorShift: { value: params.colorShift },
    uBloom: { value: params.bloom },
    uReactivity: { value: params.reactivity },
    uPlateShape: { value: 0 }, 
    uModeN: { value: 2.0 },
    uModeM: { value: 2.0 },
    uDepthDisplacement: { value: params.depthDisplacement },
    
    // New Object Seeding Uniforms
    uResonanceMap: { value: null },
    uUseObjectSeeding: { value: params.useObjectSeeding },
    uBeatCumulative: { value: 0 },
  }), []);

  useEffect(() => {
    if (materialRef.current) {
        if (userTexture) {
            userTexture.wrapS = THREE.MirroredRepeatWrapping;
            userTexture.wrapT = THREE.MirroredRepeatWrapping;
            materialRef.current.uniforms.uTexture.value = userTexture;
            materialRef.current.uniforms.uHasTexture.value = true;
        } else {
            materialRef.current.uniforms.uHasTexture.value = false;
        }
    }
  }, [userTexture]);

  useEffect(() => {
    if (materialRef.current && resonanceTexture) {
      materialRef.current.uniforms.uResonanceMap.value = resonanceTexture;
    }
  }, [resonanceTexture]);

  useFrame((state, delta) => {
    if (materialRef.current && meshRef.current) {
      const { bass, mid, high, dominantFreq, centroid, beat } = audioData.current;
      const r = params.reactivity;

      timeRef.current += delta * (0.1 + params.rotationSpeed * 0.2);
      materialRef.current.uniforms.uTime.value = timeRef.current;

      // --- BEAT ACCUMULATION (Symmetry Jumps) ---
      if (beat) {
          // Shift phase by 60 degrees (PI/3) - Sacred 3-6-9 logic
          beatCumulativeRef.current += Math.PI / 3.0;
      }
      // Smooth decay or just step? Stepping is better for "Jumps"
      materialRef.current.uniforms.uBeatCumulative.value = beatCumulativeRef.current;

      // --- TRANSFORMS ---
      meshRef.current.position.set(params.position.x, params.position.y, 0);
      meshRef.current.rotation.x = params.rotation.x + (bass * 0.1 * r);
      meshRef.current.rotation.y = params.rotation.y + (mid * 0.1 * r);
      if (params.plateShape === 'torus') {
         meshRef.current.rotation.z += delta * 0.05; 
      }

      // --- PHYSICS ---
      const targetN = Math.max(2, Math.sqrt(dominantFreq || 100) * 0.5);
      const targetM = Math.max(2, params.symmetry + (centroid * 10));

      physicsRef.current.n = THREE.MathUtils.lerp(physicsRef.current.n, targetN, 0.05);
      physicsRef.current.m = THREE.MathUtils.lerp(physicsRef.current.m, targetM, 0.05);

      materialRef.current.uniforms.uModeN.value = physicsRef.current.n;
      materialRef.current.uniforms.uModeM.value = physicsRef.current.m;

      // Uniforms Updates
      materialRef.current.uniforms.uZoom.value = 1.0 / params.zoom;
      materialRef.current.uniforms.uReactivity.value = params.reactivity;
      materialRef.current.uniforms.uColorShift.value = params.colorShift;
      materialRef.current.uniforms.uBloom.value = params.bloom;
      materialRef.current.uniforms.uDepthDisplacement.value = params.depthDisplacement;
      materialRef.current.uniforms.uUseObjectSeeding.value = params.useObjectSeeding;
      
      let shapeInt = 0;
      if (params.plateShape === 'circle') shapeInt = 1;
      if (params.plateShape === 'polygon') shapeInt = 2;
      if (params.plateShape === 'torus') shapeInt = 3;
      materialRef.current.uniforms.uPlateShape.value = shapeInt;

      materialRef.current.uniforms.uBass.value = THREE.MathUtils.lerp(materialRef.current.uniforms.uBass.value, bass * r, 0.2);
      materialRef.current.uniforms.uMid.value = THREE.MathUtils.lerp(materialRef.current.uniforms.uMid.value, mid * r, 0.2);
      materialRef.current.uniforms.uHigh.value = THREE.MathUtils.lerp(materialRef.current.uniforms.uHigh.value, high * r, 0.2);
    }
  });

  return (
    <mesh ref={meshRef} rotation={[-0.5, 0, 0]}> 
      {params.plateShape === 'torus' ? (
        <torusGeometry args={[1, 0.4, 128, 256]} />
      ) : (
        <planeGeometry args={[5, 5, 256, 256]} />
      )}
      
      <shaderMaterial
        ref={materialRef}
        vertexShader={vertexShaderCymatic}
        fragmentShader={fragmentShaderCymatic}
        uniforms={uniforms}
        transparent={true}
        side={THREE.DoubleSide}
        depthWrite={true}
      />
    </mesh>
  );
};

export const VisualizerCanvas: React.FC<SceneProps> = (props) => {
  return (
    <Canvas
      camera={{ position: [0, 0, 4], fov: 60 }} 
      dpr={[1, 2]} 
      style={{ width: '100%', height: '100%' }}
    >
      <CymaticPlate {...props} />
    </Canvas>
  );
};