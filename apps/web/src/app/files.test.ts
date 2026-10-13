import * as alphaTab from '@coderline/alphatab';
import { describe, expect, it } from 'vitest';
import { printSmuflFontSources } from './files';

describe('printSmuflFontSources', () => {
  it('creates a popup-specific Bravura registration while keeping the font path', () => {
    const sources = printSmuflFontSources('https://fretflow.iliasai.com/font/', 'print-123');

    expect(sources.get(alphaTab.FontFileFormat.Woff2)).toBe(
      'https://fretflow.iliasai.com/font/Bravura.woff2?fretflow-print=print-123',
    );
    expect(sources.get(alphaTab.FontFileFormat.Woff)).toBe(
      'https://fretflow.iliasai.com/font/Bravura.woff?fretflow-print=print-123',
    );
    expect(sources.get(alphaTab.FontFileFormat.OpenType)).toBe(
      'https://fretflow.iliasai.com/font/Bravura.otf?fretflow-print=print-123',
    );
  });
});
