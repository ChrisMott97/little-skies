# little skies

A tiny, cosy flight sim: a biplane, an island, and some clouds. Built with Three.js + Vite.

## Run

Double-click **`Little Skies.command`** in Finder, or:

```sh
npm install
npm run dev      # opens http://localhost:5173
```

Edits hot-reload in the browser. `window.sim` in the dev console exposes the flight model, scene, etc.

## Controls

| keys | action |
|---|---|
| ↑ / ↓ | nose down / up (`I` inverts) |
| ← / → | roll |
| W / S | throttle |
| A / D | rudder, steering on the ground |
| space | brakes |
| drag / scroll | look around / zoom |
| C | chase / pilot camera |
| T / return | jump into the sky / back to the airfield |
| G | let a few hours pass (day → golden hour → sunset → night) |
| M / N / P / H | sound / music / pause / help |

### Bumping into things

The world reacts when you fly close or straight into it:

- **hot air balloons** pop in a shower of confetti. The envelope zips off like a let-go party balloon, and the basket (with its balloonist) drifts down on a parachute. A fresh balloon reinflates once you've flown off.
- **houses and barns** burst into toy blocks. The plane ploughs through, a bit slower. After a while the blocks fly back into place and the house springs back up.
- **the clock tower, lighthouse, windmill and giant tree trunk** are sturdy: you bonk off them as you would off a hillside.
- **treetops** shake and shed leaves as you brush through them. The giant tree's canopy is one big leafy whoosh.
- **flying low**, the prop wash sends rings rolling through the grass, crops and water, pushes the treetops aside, and kicks up petals over meadows or spray over water.
- **sheep** bound away when you buzz them, **birds** scatter and regroup, **the windmill** spins up as you pass, and **clouds** part around you as you fly through (they drift back together slowly).

### On a phone or tablet

Touch controls appear on the first touch (add `?touch` to the URL to try them with a mouse). Landscape is best; portrait works too.

- **left thumb**: throttle lever. Slide it up or down from anywhere on the left; it stays where you leave it. Closing it on the ground brakes.
- **right thumb**: stick. Thumb up = nose down, down = nose up, left/right = roll (also steers on the ground).
- **drag the sky** to look around, **pinch** to zoom.
- **tilt**: steer by tilting the device. However you're holding it when you turn it on counts as level; ⟲ re-centres. It needs https (fine on GitHub Pages). For local testing on a phone, serve the dev server over https.
- **☰**: everything else (camera, into the sky, airfield, pass time, sound, music, pause, invert pitch, fullscreen).

## Where things live

- `src/touch.js`: phone/tablet controls: thumbstick, throttle lever, tilt steering, the ☰ menu. Dormant on desktop.
- `src/world/interactions.js`: the plane bumping into the world: smashing and rebuilding houses, sturdy landmarks, brushing treetops, and the prop wash (ripples, petals, spray). Balloons, sheep and birds react in `life.js`, clouds in `sky.js`.
- `src/fx.js`: pooled effects: puffs, fluttering confetti/leaves, and toy-block debris that can fly back home.
- `src/plane/flight.js`: flight model. All the feel is in `TUNING` at the top.
- `src/plane/model.js`: the biplane, built from primitives. Colours in `PALETTE`.
- `src/world/terrain.js`: island height function (`heightFn`), the painted per-pixel ground shader (including the wind waves rolling through grass and crops), airfield/lake/village placement (`WORLD`), and the river's waypoints (`RIVER`).
- `src/world/river.js`: finds the river's course the way water would (least-cost path along valley floors), carves a flat bed and soft banks into the terrain, and bakes a distance + flow map. The terrain shader paints the water from that map, so there's no separate water mesh to seam or clip.
- `src/world/daycycle.js`: time of day. Keyframes (`KEYS`) for sun, sky, fog, clouds, sea and colour grade; a half-hour day that lingers through golden hour and sunset; stars, moon, and glowing windows and lamps at night.
- `src/world/movers.js`: life on the move: cars, a bus, hay carts and cyclists on the roads (they ride over the bridges), fishing boats and yachts with wakes.
- `src/world/layout.js`: decides where everything goes: landmarks, roads, village streets + houses, patchwork fields (`CROPS` weights).
- `src/world/paint.js`: paints roads, cobbles and crop fields into the texture laid over the terrain (`CROP_COLOURS`).
- `src/world/buildings.js`: house generator (`PAL` colours), clock tower, windmill, lighthouse, barns, giant tree, pier + boats.
- `src/world/life.js`: hedgerows, orchards, hay bales, sheep, hot air balloons, birds, chimney smoke.
- `src/post.js`: bloom + warm colour grade.
- `src/world/trees.js`: forest scattering + wildflowers.
- `src/world/water.js`, `sky.js`: stylised sea + flowing river ribbon, sky gradient, cumulus clouds (a few towering ones).
- `src/world/airfield.js`: runway, hangar, cottage, windsock.
- `src/materials.js`: toon/cel shading with rim light, wind sway, ink outlines.
- `src/audio.js`: soft engine hum, wind gusts, birdsong when you fly low, surf along the coast, the clock tower's bells near the village.
- `src/music.js`: generative score. Each piece is composed live (key, waltz or 4/4, chord progression, a motif that returns), played on a synthesised felt piano (with the odd music-box shimmer), with long quiet pauses between pieces.
