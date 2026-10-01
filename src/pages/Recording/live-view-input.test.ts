import { describe, expect, it } from 'vitest';
import { keyMessage, liveViewSocketUrl, modifierMask, toPagePoint } from './live-view-input';

const viewport = { width: 1280, height: 1024 };

describe('toPagePoint', () => {
  it('maps a click on a scaled-down canvas back to page pixels', () => {
    // Canvas shown at half size, offset 100/50 on screen.
    expect(toPagePoint(100 + 320, 50 + 256, { left: 100, top: 50, width: 640, height: 512 }, viewport)).toEqual({ x: 640, y: 512 });
  });
  it('clamps positions outside the canvas to the page edges', () => {
    expect(toPagePoint(-50, 5000, { left: 0, top: 0, width: 640, height: 512 }, viewport)).toEqual({ x: 0, y: 1024 });
  });
});

describe('keyMessage', () => {
  it('a printable key carries text so the page gets keypress/input', () => {
    expect(keyMessage({ type: 'keydown', key: '4', code: 'Digit4', keyCode: 52 }, 3)).toEqual({ t: 'key', type: 'keyDown', key: '4', code: 'Digit4', keyCode: 52, text: '4', modifiers: 0, seq: 3 });
  });
  it('Enter carries a carriage return; Tab and arrows carry no text', () => {
    expect(keyMessage({ type: 'keydown', key: 'Enter' })?.text).toBe('\r');
    expect(keyMessage({ type: 'keydown', key: 'Tab' })?.text).toBeUndefined();
    expect(keyMessage({ type: 'keydown', key: 'ArrowDown' })?.text).toBeUndefined();
  });
  it('a Ctrl/Cmd chord is a shortcut, never typed text', () => {
    const message = keyMessage({ type: 'keydown', key: 'a', ctrlKey: true });
    expect(message?.text).toBeUndefined();
    expect(message?.modifiers).toBe(2);
  });
  it('keyup never carries text; dead/unidentified keys are dropped', () => {
    expect(keyMessage({ type: 'keyup', key: 'a' })?.text).toBeUndefined();
    expect(keyMessage({ type: 'keydown', key: 'Dead' })).toBeUndefined();
    expect(keyMessage({ type: 'keydown', key: 'Unidentified' })).toBeUndefined();
  });
  it('modifier mask follows CDP (Alt=1, Ctrl=2, Meta=4, Shift=8)', () => {
    expect(modifierMask({ altKey: true, shiftKey: true })).toBe(9);
  });
});

describe('liveViewSocketUrl', () => {
  it('uses the panel origin when no API base is configured (the deployed case)', () => {
    expect(liveViewSocketUrl('rec 1', '', { protocol: 'http:', host: 'srvdevqaca01:3001' })).toBe('ws://srvdevqaca01:3001/api/recordings/rec%201/live');
    expect(liveViewSocketUrl('r', '', { protocol: 'https:', host: 'qa.example' })).toBe('wss://qa.example/api/recordings/r/live');
  });
  it('follows an explicit API base (local development)', () => {
    expect(liveViewSocketUrl('r', 'http://localhost:3001', { protocol: 'http:', host: 'localhost:5173' })).toBe('ws://localhost:3001/api/recordings/r/live');
  });
});
