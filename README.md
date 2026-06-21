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

All cues are synthesized at runtime from oscillators and shaped noise, tuned to
an A-minor-pentatonic palette and glued together with a small generated reverb,
so multi-note cues stay consonant rather than sounding random. Audio only starts
after the first user interaction (browser autoplay policy) and can be muted from
the HUD. See `src/audio/sound.ts`.

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
