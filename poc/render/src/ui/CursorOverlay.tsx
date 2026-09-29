import type { CursorBox } from '../alphatab/bounds';

interface CursorOverlayProps {
  box: CursorBox | null;
  /** Offset of alphaTab's own surface inside the scroll container. */
  offset: { left: number; top: number };
}

/**
 * SPEC section 6 asks for the cursor to live on its own layer above alphaTab
 * rather than being drawn into the score. It sits inside the scroll container so
 * it travels with the music when the page scrolls.
 */
export function CursorOverlay({ box, offset }: CursorOverlayProps) {
  if (!box) {
    return null;
  }
  return (
    <div
      className="cursor-box"
      style={{
        left: offset.left + box.x,
        top: offset.top + box.y,
        width: box.w,
        height: box.h,
      }}
    />
  );
}
