import React, { useRef, useMemo, useEffect } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { VisualParams, AnalyzedAudio } from '../types';

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

// --- Bessel Function Approximation for Circular Modes ---
// J_n(x) ~ sqrt(2/(pi*x)) * cos(x - n*pi/2 - pi/4)
float bessel(float x, float n) {
    if (x <= 0.1) return (n < 1.0) ? 1.0 : 0.0; // Limit at 0
    float phase = x - n * 1.570796 - 0.785398;
    return inversesqrt(x) * 0.79788 * cos(phase);
}

// Improved Water Physics
float chladniWater(vec2 uv, float m, float n, float t, float speed, float damping) {
    vec2 centered = uv - 0.5;
    float r = length(centered) * 2.2; 
    float theta = atan(centered.y, centered.x);
    
    float k = 3.0 + n * 4.0;
    float x = k * r;
    
    float radial = bessel(x, m);
    float angular = cos(m * theta);
    float temporal = cos(t * speed);
    
    float viscous = exp(-damping * r * r);
    
    return radial * angular * temporal * viscous;
}

// Toroidal Coordinates
// Returns vec2(theta, phi) where theta is major angle, phi is minor angle
vec2 toroidalCoords(vec3 p, float R) {
    float theta = atan(p.y, p.x);      
    float r_xy = length(vec2(p.x, p.y));
    float dist_minor = r_xy - R;
    float phi = atan(p.z, dist_minor);          
    return vec2(theta, phi);
}

// Chladni on Torus
// Uses integer modes n, m to ensure continuity across the surface
float chladniTorus(vec2 tp, float n, float m) {
    float theta = tp.x;
    float phi = tp.y;
    // Standard Chladni crossing function wrapped on torus topology
    return cos(n * theta) * cos(m * phi) - cos(m * theta) * cos(n * phi);
}

// --- NEW: Object Field Binding ---
float objectField(vec2 uv, float seed, float group, float energy, float time, float beatPhase) {
    // 3-6-9 Harmonic Logic
    float m = (group * 3.0) + (energy * 6.0);
    float n = (group * 6.0) + (energy * 6.0);
    float drift = time * (seed * 2.0);
    float phase = drift + beatPhase;
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
varying vec3 vViewPos;

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
uniform sampler2D uResonanceMap; 
uniform bool uUseObjectSeeding;
uniform float uBeatCumulative; 

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
      // Map 3D pos to Toroidal Angles (R=1.0 matches geometry)
      vec2 tp = toroidalCoords(pos, 1.0);
      
      // Quantize modes to integers to avoid seams on the closed surface
      float tN = floor(max(2.0, baseN * 2.0));
      float tM = floor(max(2.0, baseM * 2.0));
      
      pattern += chladniTorus(tp, tN, tM) * (0.6 + uBass);
      
      // Secondary harmonic
      pattern += chladniTorus(tp, tN + 1.0, tM + 1.0) * uMid;
      
  } else if (uPlateShape == 4) { // WATER
      float waveSpeed = 2.0 + uReactivity * 4.0;
      float damping = 0.1 + uMid * 0.5; 
      pattern += chladniWater(finalUV, baseM, baseN, uTime, waveSpeed, damping) * (0.8 + uBass);
      pattern += chladniWater(finalUV, baseM + 2.0, baseN + 1.0, uTime, waveSpeed * 1.2, damping) * uMid * 0.3;
  }

  // --- OBJECT SEEDING ---
  if (uUseObjectSeeding) {
      vec4 resData = texture2D(uResonanceMap, vUv); 
      float seedFreq = resData.r * 10.0; 
      float harmonicGroup = resData.g * 10.0; 
      float maskIntensity = resData.b;
      
      if (maskIntensity > 0.1) {
          float objPat = objectField(finalUV, seedFreq, harmonicGroup, uBass + uMid, uTime, uBeatCumulative);
          float blend = maskIntensity * (0.5 + uBass * 0.5);
          pattern = mix(pattern, objPat, blend);
      }
  }
  
  float noiseDetail = snoise(finalUV * 15.0 + uTime) * (uHigh * 0.2);
  float energy = pattern + noiseDetail;
  vEnergy = energy;
  
  float zDisp = energy * uDepthDisplacement * uReactivity;
  pos += objectNormal * zDisp;
  
  vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
  vViewPos = -mvPosition.xyz;
  gl_Position = projectionMatrix * mvPosition;
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
uniform int uPlateShape; 

varying vec2 vUv;
varying float vEnergy; 
varying vec3 vViewPos;

vec3 palette( in float t, in vec3 a, in vec3 b, in vec3 c, in vec3 d ) {
    return a + b*cos( 6.28318*(c*t+d) );
}

void main() {
    float vibration = vEnergy; 
    
    // --- WATER RENDERING ---
    if (uPlateShape == 4) {
        float bumpScale = 5.0;
        vec3 dx = vec3(1.0, 0.0, dFdx(vibration) * bumpScale);
        vec3 dy = vec3(0.0, 1.0, dFdy(vibration) * bumpScale);
        vec3 normal = normalize(cross(dx, dy));
        
        vec3 viewDir = normalize(vViewPos);
        vec3 lightDir = normalize(vec3(0.5, 0.8, 1.0));
        vec3 halfVec = normalize(lightDir + viewDir);
        
        float NdotH = max(0.0, dot(normal, halfVec));
        float specular = pow(NdotH, 80.0); 
        float fresnel = pow(1.0 - max(0.0, dot(normal, viewDir)), 3.0);
        
        vec3 deepColor = vec3(0.0, 0.05, 0.2);
        vec3 shallowColor = vec3(0.0, 0.4, 0.6);
        vec3 foamColor = vec3(0.9, 0.95, 1.0);
        
        float h = vibration * 0.5 + 0.5;
        vec3 albedo = mix(deepColor, shallowColor, smoothstep(0.3, 0.7, h));
        albedo = mix(albedo, foamColor, smoothstep(0.85, 1.0, h) * 0.8);
        
        vec3 col = albedo;
        col += vec3(1.0) * specular * 0.8;
        col += vec3(0.5, 0.7, 1.0) * fresnel * 0.3;
        
        vec3 pCol = palette(uColorShift, vec3(0.5), vec3(0.5), vec3(1.0), vec3(0.0, 0.33, 0.67));
        col = mix(col, col * pCol, 0.3);
        
        gl_FragColor = vec4(col, 0.9);
        
    } else {
        // --- STANDARD CHLADNI RENDERING ---
        float absVib = abs(vibration);
        float nodalLine = 1.0 - smoothstep(0.01, 0.08 + uHigh * 0.1, absVib);
        float antinode = smoothstep(0.2, 1.0, absVib);

        vec3 col = vec3(0.0);
        vec3 pCol = palette(absVib * 0.5 + uColorShift + uTime*0.1, 
                            vec3(0.5), vec3(0.5), vec3(1.0), vec3(0.0, 0.33, 0.67));

        if (uHasTexture) {
            vec3 texColor = texture2D(uTexture, vUv).rgb;
            col = texColor;
            vec3 sandColor = vec3(0.9, 0.9, 0.8);
            col = mix(col, sandColor, nodalLine * 0.6);
            col += pCol * antinode * uBloom * uReactivity;
        } else {
            col = vec3(0.02, 0.02, 0.05); 
            col += pCol * absVib * uBloom * 1.5;
            col += vec3(1.0) * nodalLine * 0.6;
        }

        gl_FragColor = vec4(col, 1.0);
    }
}
`;

interface SceneProps {
  params: VisualParams;
  audioData: React.MutableRefObject<AnalyzedAudio>;
  userTexture: THREE.Texture | null;
  resonanceTexture: THREE.Texture | null;
  onCanvasCreated?: (canvas: HTMLCanvasElement) => void;
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
      if (params.plateShape === 'water') shapeInt = 4;
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
        extensions={{ derivatives: true }} 
      />
    </mesh>
  );
};

export const VisualizerCanvas: React.FC<SceneProps> = ({ onCanvasCreated, ...props }) => {
  return (
    <Canvas
      camera={{ position: [0, 0, 4], fov: 60 }} 
      dpr={[1, 2]} 
      style={{ width: '100%', height: '100%' }}
      onCreated={({ gl }) => onCanvasCreated?.(gl.domElement)}
    >
      <CymaticPlate {...props} />
    </Canvas>
  );
};