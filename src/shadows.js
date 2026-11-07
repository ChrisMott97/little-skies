// Fade shadows out towards the edge of the shadow map instead of stopping in a hard line.
// The sun's shadow only covers a square around the plane, so without this you can watch its
// edge sweep across the hills as you fly. Patches three.js's shared shadow chunk once, before
// any material compiles.
import { ShaderChunk } from 'three';

const RETURN = 'return mix( 1.0, shadow, shadowIntensity );';
const FADED = `vec2 shadowEdge = min( shadowCoord.xy, 1.0 - shadowCoord.xy );
			float shadowFade = smoothstep( 0.0, 0.18, min( shadowEdge.x, shadowEdge.y ) );
			return mix( 1.0, shadow, shadowIntensity * shadowFade );`;

const src = ShaderChunk.shadowmap_pars_fragment;
if (src.includes(RETURN)) {
  ShaderChunk.shadowmap_pars_fragment = src.split(RETURN).join(FADED);
} else {
  console.warn('[sim] shadow edge fade not applied (three.js shadow chunk changed)');
}
