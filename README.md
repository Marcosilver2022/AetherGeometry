# AetherGeometry

AetherGeometry is a browser-based 3D cymatics playground for turning audio, images, and AI-generated presets into reactive Chladni-style geometry. The latest refinement adds a Codex Feature Layer for sharper agentic mesh highlights, quick-enable controls, and documentation for iterating on the app with Codex.

## What is new

- **Codex Feature Layer**: a cyan harmonic overlay that adds predictive filament detail to the visualizer.
- **One-click Codex toggle**: enables the refinement layer while lifting bloom and complexity for a stronger generated look.
- **Refined status/version copy**: the app now identifies itself as the Codex-refined 3D cymatic engine.
- **Video texture uploads**: loop local video files as animated visual textures on the cymatic surface.
- **Cleaner local setup notes**: use Vite with Gemini API credentials for AI resonance presets.

## Features

- Real-time microphone or audio-file analysis.
- Multiple cymatic plate modes: square, circle, polygon, torus, and water.
- 3D spatial controls for position, tilt, relief depth, bloom, color, and reactivity.
- Image texture upload with object-seeded resonance maps.
- Video texture upload for animated surface sources.
- AI Resonance preset generation through Gemini.
- WebM canvas recording for exporting visual sessions.

## Run locally

**Prerequisites:** Node.js 20+ is recommended.

1. Install dependencies:

   ```bash
   npm install
   ```

2. Create `.env.local` and add your Gemini API key:

   ```bash
   GEMINI_API_KEY=your_key_here
   API_KEY=your_key_here
   ```

   The current Gemini service reads `API_KEY` in the Vite runtime environment.

3. Start the dev server:

   ```bash
   npm run dev
   ```

4. Build for production:

   ```bash
   npm run build
   ```

## Codex workflow

Use Codex to safely iterate on visuals and interaction details:

- Ask Codex for shader refinements when changing `components/Visualizer.tsx`.
- Ask Codex for UI/UX updates when changing `components/Controls.tsx`.
- Run `npm run build` before committing to confirm the Vite bundle is healthy.

## Project structure

```text
App.tsx                    App state, audio/image handlers, recording, footer status
components/Controls.tsx    Right-side control panel and Codex feature controls
components/Visualizer.tsx  React Three Fiber scene and GLSL cymatic shaders
services/                  Audio, vision, and Gemini integrations
types.ts                   Shared application types
```
