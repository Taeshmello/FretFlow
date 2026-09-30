import * as alphaTab from '@coderline/alphatab';
import { createScore } from '@fretflow/score-model';
import { describe, expect, it } from 'vitest';
import { barWeights, hasCustomWidths, LAYOUT_UNIT_PX, LINE_START_PX, lineBreaks, naturalBarWeight, relayoutForWidth } from './layout';
import { toAlphaTab } from './toAlphaTab';

describe('custom bar widths', () => {
  it('weighs a bar by its busiest track, with an empty 4/4 bar as four quarters', () => {
    const score = createScore({ instrument: 'guitar', bars: 2 });
    const eighths = score.tracks[0].bars[1];
    eighths.beats = [...eighths.beats, ...eighths.beats.map(b => ({ ...b, id: `${b.id}x` }))].map(b => ({ ...b, duration: { base: 8, dots: 0 } }));
    expect(naturalBarWeight(score, 0)).toBeCloseTo(4 * 1.35);
    expect(naturalBarWeight(score, 1)).toBeCloseTo(8 * 1.15);
  });

  it('scales the natural weight by the bar width', () => {
    const score = createScore({ instrument: 'guitar', bars: 2 });
    score.masterBars[1].width = 2;
    const [a, b] = barWeights(score);
    expect(b).toBeCloseTo(a * 2);
    expect(hasCustomWidths(score)).toBe(true);
  });

  it('fills lines up to the available width and never leaves a line empty', () => {
    const width = LINE_START_PX + 10 * LAYOUT_UNIT_PX;
    expect(lineBreaks([4, 4, 4, 4, 4], width)).toEqual([2, 2, 1]);
    expect(lineBreaks([4, 12, 4], width)).toEqual([1, 1, 1]);
    expect(lineBreaks([], width)).toEqual([]);
  });

  it('switches alphaTab to our layout only when a bar has a custom width', () => {
    const score = createScore({ instrument: 'guitar', bars: 4 });
    const plain = toAlphaTab(score, { staffMode: 'scoreTab', layoutWidth: 1000 }, new alphaTab.Settings());
    expect(plain.modelLayout).toBe(false);
    expect(plain.score.masterBars[0].displayScale).toBe(1);

    score.masterBars[1].width = 2;
    const custom = toAlphaTab(score, { staffMode: 'scoreTab', layoutWidth: 1000 }, new alphaTab.Settings());
    expect(custom.modelLayout).toBe(true);
    expect(custom.score.masterBars[1].displayScale).toBeCloseTo(custom.score.masterBars[0].displayScale * 2);
    expect(custom.score.tracks[0].staves[0].bars[1].displayScale).toBeCloseTo(custom.score.masterBars[1].displayScale);
    expect(custom.score.systemsLayout.reduce((a, b) => a + b, 0)).toBe(4);
    expect(custom.score.tracks[0].systemsLayout).toEqual(custom.score.systemsLayout);
  });

  it('re-breaks lines for a narrower page from the first printed bar, and leaves automatic layouts alone', () => {
    const score = createScore({ instrument: 'guitar', bars: 8 });
    score.masterBars[0].width = 2;
    const { score: model } = toAlphaTab(score, { staffMode: 'scoreTab', layoutWidth: 2000 }, new alphaTab.Settings());
    const w = model.masterBars[1].displayScale;
    relayoutForWidth(model, LINE_START_PX + w * 2 * LAYOUT_UNIT_PX + 1, 2, 5);
    expect(model.systemsLayout).toEqual([2, 2, 1]);
    expect(model.tracks[0].systemsLayout).toEqual([2, 2, 1]);

    const plain = toAlphaTab(createScore({ instrument: 'guitar', bars: 8 }), { staffMode: 'scoreTab', layoutWidth: 2000 }, new alphaTab.Settings()).score;
    relayoutForWidth(plain, 300);
    expect(plain.systemsLayout).toEqual([]);
  });
});
