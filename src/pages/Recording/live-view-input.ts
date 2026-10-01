/**
 * Pure helpers for the live view of a "remote" recording: the canvas shows the server browser
 * scaled to fit, so every pointer position is mapped back to page pixels, and keyboard events are
 * turned into the messages the engine replays through CDP.
 */

export type Viewport = { width: number; height: number };
export type CanvasRect = { left: number; top: number; width: number; height: number };

export function toPagePoint(clientX: number, clientY: number, rect: CanvasRect, viewport: Viewport): { x: number; y: number } {
  const scaleX = rect.width > 0 ? viewport.width / rect.width : 1;
  const scaleY = rect.height > 0 ? viewport.height / rect.height : 1;
  const x = Math.min(Math.max(0, (clientX - rect.left) * scaleX), viewport.width);
  const y = Math.min(Math.max(0, (clientY - rect.top) * scaleY), viewport.height);
  return { x: Math.round(x), y: Math.round(y) };
}

/** CDP modifier bitmask: Alt=1, Ctrl=2, Meta=4, Shift=8. */
export function modifierMask(event: { altKey?: boolean; ctrlKey?: boolean; metaKey?: boolean; shiftKey?: boolean }): number {
  return (event.altKey ? 1 : 0) | (event.ctrlKey ? 2 : 0) | (event.metaKey ? 4 : 0) | (event.shiftKey ? 8 : 0);
}

export type KeyLikeEvent = {
  type: 'keydown' | 'keyup';
  key: string;
  code?: string;
  keyCode?: number;
  altKey?: boolean;
  ctrlKey?: boolean;
  metaKey?: boolean;
  shiftKey?: boolean;
};

/**
 * A printable key (one character, no Ctrl/Meta chord) carries `text`, so the page receives
 * keypress/input exactly like a real keystroke. Enter carries "\r" for the same reason.
 */
export function keyMessage(event: KeyLikeEvent, seq?: number) {
  if (!event.key || event.key === 'Unidentified' || event.key === 'Dead') return undefined;
  const chord = event.ctrlKey || event.metaKey;
  const text = event.type === 'keydown'
    ? (event.key.length === 1 && !chord ? event.key : event.key === 'Enter' ? '\r' : undefined)
    : undefined;
  return {
    t: 'key' as const,
    type: event.type === 'keydown' ? ('keyDown' as const) : ('keyUp' as const),
    key: event.key,
    ...(event.code ? { code: event.code } : {}),
    ...(typeof event.keyCode === 'number' ? { keyCode: event.keyCode } : {}),
    ...(text ? { text } : {}),
    modifiers: modifierMask(event),
    ...(seq !== undefined ? { seq } : {}),
  };
}

/** Same origin as the panel unless an explicit API base is configured (http -> ws, https -> wss). */
export function liveViewSocketUrl(recordingId: string, apiBase: string, location: { protocol: string; host: string }): string {
  const path = `/api/recordings/${encodeURIComponent(recordingId)}/live`;
  if (apiBase) {
    const base = new URL(apiBase);
    return `${base.protocol === 'https:' ? 'wss:' : 'ws:'}//${base.host}${path}`;
  }
  return `${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}${path}`;
}
