# BBB // BIG BOYS BOMBS

A fictional, satirical sci-fi "defense logistics" storefront — a single-page
WebGL experience built as a front-end showpiece. You browse an arsenal of
made-up ordnance, stage a deployment queue, lock targets on a 3D globe, and run
an impact simulator, all wrapped in a military-HUD aesthetic.

> ⚠️ **This is fiction.** Every weapon, statistic, price, coordinate and address
> in this project is invented for an art/portfolio piece. Nothing here describes
> real systems, and it is not an endorsement of violence.

## Stack

- **React 18** + **TypeScript** (Vite)
- **Three.js** for the globe, starfield, ring particle system and post-processing
  (custom glitch/scanline shader)
- **GSAP** for UI and camera animation
- **Web Audio API** for a fully procedural sound engine (no audio files)

## Getting started

```bash
npm install
npm run dev      # start the dev server
npm run build    # type-check (tsc) + production build
npm run preview  # preview the production build
```

Then open the printed local URL.

## Docker

Build and serve the production bundle in a container (nginx) on **port 8222**:

```bash
# with docker compose
docker compose up --build
# → http://localhost:8222

# or with plain docker
docker build -t bbb-spa .
docker run --rm -p 8222:8222 bbb-spa
```

The image is multi-stage: a Node stage runs `npm ci && npm run build`, then the
static `dist/` is served by nginx (`nginx.conf`, SPA fallback, hashed-asset
caching) listening on 8222.

## Controls

- **Click a menu label** on the landing scene to enter a section
- **Compass** (top, inside a section) — click an item or scroll to switch
- **Esc** — return to the landing scene
- **Simulator** — click anywhere on the globe to deploy; drag to rotate;
  **RESET** clears all impacts and zeroes the registry
- **Target picker** — click the globe to set impact coordinates
- **Sound toggle** — top-right of the HUD (preference is remembered)
- **T** — open the developer tweaks panel (live scene parameters)

## Sound

Hybrid engine (`src/audio/sound.ts`). UI cues are synthesized at runtime from
oscillators and shaped noise, tuned to an A-minor-pentatonic palette and glued
together with a small generated reverb, so they stay consonant rather than
sounding random. A few impactful cues (`impact`, `laser`, `nav`) use real
royalty-free samples from `public/sounds/`; if a file is missing the engine
falls back to the synthesized version. Drop your own `public/sounds/<cue>.mp3`
to override any cue. Audio only starts after the first user interaction (browser
autoplay policy) and can be muted from the HUD.

## Simulator effects

Each weapon category detonates differently: nukes throw a big fireball, white
core, twin shockwaves, debris and a rising smoke plume; missiles/drones arc in
as guided projectiles before impact; and **orbital lasers play a short
cinematic** — the camera zooms to an orbital platform above the target that
fires a beam column. Every strike leaves a persistent scorch decal on the
planet; **RESET** clears them.

## Accessibility & performance

- Honors `prefers-reduced-motion` (disables the scanline, intro glitch and
  looping animations)
- Pauses the WebGL render loop while the browser tab is hidden
- Keyboard focus styles on interactive elements

## Project layout

```
src/
  audio/sound.ts        procedural Web Audio engine
  scene/                Three.js scenes (landing, simulator, target picker, earth)
  components/           HUD, compass, tweaks panel, splash
  components/pages/     arsenal, cart, simulator, information, target overlay
  data.ts               fictional weapon catalog + region helper
  types.ts              shared types
  styles/globals.css    all styling
```
