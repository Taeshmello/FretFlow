import type { AlphaTabOptions } from '../alphatab/useAlphaTab';
import type { BuildMethod } from '../score/benchScore';

export type ScoreSource = 'sample' | BuildMethod;
export type RenderMode = 'full' | 'reuseViewport' | 'partial';

export const SCORE_SOURCES: { value: ScoreSource; label: string }[] = [
  { value: 'sample', label: '4마디 샘플' },
  { value: 'alphaTex', label: '200마디 (alphaTex)' },
  { value: 'modelClone', label: '200마디 (모델 복제)' },
];

export const RENDER_MODES: { value: RenderMode; label: string }[] = [
  { value: 'full', label: 'A 전체 재렌더' },
  { value: 'reuseViewport', label: 'B 뷰포트 재사용' },
  { value: 'partial', label: 'C 부분 (변경 마디부터)' },
];

interface ToolbarProps {
  source: ScoreSource;
  onSourceChange: (value: ScoreSource) => void;
  renderMode: RenderMode;
  onRenderModeChange: (value: RenderMode) => void;
  options: AlphaTabOptions;
  onOptionsChange: (value: AlphaTabOptions) => void;
  onReset: () => void;
}

export function Toolbar(props: ToolbarProps) {
  const { source, onSourceChange, renderMode, onRenderModeChange, options, onOptionsChange, onReset } = props;

  return (
    <div className="toolbar">
      <fieldset>
        <legend>악보</legend>
        {SCORE_SOURCES.map(item => (
          <button
            key={item.value}
            type="button"
            data-active={source === item.value}
            onClick={() => onSourceChange(item.value)}
          >
            {item.label}
          </button>
        ))}
      </fieldset>

      <fieldset>
        <legend>재렌더 방식</legend>
        {RENDER_MODES.map(item => (
          <button
            key={item.value}
            type="button"
            data-active={renderMode === item.value}
            onClick={() => onRenderModeChange(item.value)}
          >
            {item.label}
          </button>
        ))}
      </fieldset>

      <fieldset>
        <legend>측정 조건</legend>
        <label>
          <input
            type="checkbox"
            checked={options.engine === 'svg'}
            onChange={e => onOptionsChange({ ...options, engine: e.target.checked ? 'svg' : 'html5' })}
          />
          SVG 엔진
        </label>
        <label>
          <input
            type="checkbox"
            checked={options.enableLazyLoading}
            onChange={e => onOptionsChange({ ...options, enableLazyLoading: e.target.checked })}
          />
          lazy loading
        </label>
        <label>
          <input
            type="checkbox"
            checked={options.useWorkers}
            onChange={e => onOptionsChange({ ...options, useWorkers: e.target.checked })}
          />
          worker
        </label>
      </fieldset>

      <button type="button" className="reset" onClick={onReset}>
        측정 초기화
      </button>
    </div>
  );
}
