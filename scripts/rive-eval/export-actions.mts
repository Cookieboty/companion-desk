/**
 * Dump selected keyframe actions of the CURRENT canvas rig (packages/renderer/src/mascot/rig/actions.ts)
 * as plain JSON so the Rive generator can transcode the very same timelines into Rive LinearAnimations.
 *
 *   npx tsx scripts/rive-eval/export-actions.mts [id ...] > rive/nomi-layered/actions.json
 */
import { ACTIONS } from '../../packages/renderer/src/mascot/rig/actions';

const want = process.argv.slice(2);
const pick = want.length ? ACTIONS.filter((a) => want.includes(a.id)) : ACTIONS;
const out = pick.map((a) => ({
  id: a.id,
  dur: a.dur,
  hold: !!a.hold,
  loopFrom: a.loopFrom ?? null,
  category: a.category,
  tracks: a.tracks,
}));
process.stdout.write(`${JSON.stringify(out)}\n`);
