import * as alphaTab from '@coderline/alphatab';
import type { BendAmount, NoteEffects } from '@fretflow/score-model';
import type { Report } from './importCommon';

const at = alphaTab.model;

function bendAmount(points: readonly alphaTab.model.BendPoint[] | null): BendAmount {
  const max = Math.max(0, ...(points ?? []).map(p => p.value));
  const half = Math.round(max / 2) / 2;
  return Math.min(2, Math.max(0.5, half)) as BendAmount;
}

const HARMONICS = new Map<alphaTab.model.HarmonicType, NonNullable<NoteEffects['harmonic']>>([
  [at.HarmonicType.Natural, 'natural'],
  [at.HarmonicType.Artificial, 'artificial'],
  [at.HarmonicType.Pinch, 'pinch'],
  [at.HarmonicType.Tap, 'tap'],
  [at.HarmonicType.Semi, 'semi'],
  [at.HarmonicType.Feedback, 'feedback'],
]);

export function convertEffects(n: alphaTab.model.Note, report: Report): NoteEffects {
  const fx: NoteEffects = {};
  if (n.isHammerPullOrigin) {
    fx.hammerPull = true;
  }
  switch (n.slideOutType) {
    case at.SlideOutType.None:
      break;
    case at.SlideOutType.Legato:
      fx.slide = 'legato';
      break;
    case at.SlideOutType.Shift:
      fx.slide = 'shift';
      break;
    case at.SlideOutType.OutDown:
    case at.SlideOutType.OutUp:
      fx.slide = 'out';
      break;
    default:
      report.add('pick slides');
  }
  if (!fx.slide && n.slideInType !== at.SlideInType.None) {
    fx.slide = 'in';
  }
  if (n.hasBend) {
    const amount = bendAmount(n.bendPoints);
    switch (n.bendType) {
      case at.BendType.Bend:
      case at.BendType.Custom:
        fx.bend = { type: 'bend', amount };
        break;
      case at.BendType.Release:
        fx.bend = { type: 'release', amount };
        break;
      case at.BendType.BendRelease:
        fx.bend = { type: 'bendRelease', amount };
        break;
      case at.BendType.Prebend:
      case at.BendType.PrebendBend:
      case at.BendType.PrebendRelease:
        fx.bend = { type: 'prebend', amount };
        break;
      default:
        fx.bend = { type: 'bend', amount };
    }
  }
  if (n.vibrato !== at.VibratoType.None) {
    fx.vibrato = n.vibrato === at.VibratoType.Wide ? 'wide' : 'slight';
  }
  if (n.isPalmMute) {
    fx.palmMute = true;
  }
  if (n.isDead) {
    fx.dead = true;
  }
  if (n.isLetRing) {
    fx.letRing = true;
  }
  const harmonic = HARMONICS.get(n.harmonicType);
  if (harmonic) {
    fx.harmonic = harmonic;
    if (harmonic !== 'natural' && Math.abs(n.harmonicValue - 12) > 0.01) {
      report.add('harmonics other than an octave up (set to an octave)');
    }
  }
  if (n.isTrill) {
    report.add('trills');
  }
  if (n.isGhost) {
    report.add('ghost notes');
  }
  if (n.accentuated !== at.AccentuationType.None) {
    report.add('accents');
  }
  if (n.isStaccato) {
    report.add('staccato');
  }
  if (n.isLeftHandTapped || n.beat.tap) {
    fx.tap = true;
  }
  return fx;
}
