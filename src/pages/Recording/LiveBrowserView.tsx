import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, Loader2, RotateCw, Eye } from 'lucide-react';
import { getToken } from '../../services/http';
import { keyMessage, liveViewSocketUrl, toPagePoint, type Viewport } from './live-view-input';

/**
 * The recording browser of a "remote" recording, streamed from the server into this panel.
 *
 * Frames arrive as JPEG over a WebSocket and are drawn on a canvas; the person's mouse, wheel,
 * keyboard and paste go back to the server browser, where Capture V2 records them exactly like
 * clicks on a visible browser. The OS cursor stays local, so pointing never waits on the network.
 */

type Status = 'connecting' | 'live' | 'view_only' | 'closed' | 'error';

const MOVE_THROTTLE_MS = 33;
const API_BASE = import.meta.env.VITE_API_URL ?? '';

const ERROR_MESSAGES: Record<string, string> = {
  missing_token: 'Tu sesión no es válida. Vuelve a iniciar sesión.',
  invalid_token: 'Tu sesión expiró. Vuelve a iniciar sesión.',
  password_change_required: 'Debes cambiar tu contraseña antes de grabar.',
  forbidden: 'No tienes acceso a esta grabación.',
  recording_closed: 'La grabación terminó.',
};

export function LiveBrowserView({ recordingId, viewport }: { recordingId: string; viewport: Viewport }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const [status, setStatus] = useState<Status>('connecting');
  const [error, setError] = useState<string | null>(null);
  const [url, setUrl] = useState('');
  const [latency, setLatency] = useState<number | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext('2d');
    const socket = new WebSocket(liveViewSocketUrl(recordingId, API_BASE, window.location));
    socket.binaryType = 'arraybuffer';
    socketRef.current = socket;
    let pendingHeader: { inputSeq?: number; url?: string } | null = null;
    const sentAt = new Map<number, number>();
    let disposed = false;

    socket.onopen = () => socket.send(JSON.stringify({ t: 'auth', token: getToken() }));
    socket.onmessage = async (event) => {
      if (typeof event.data === 'string') {
        const message = JSON.parse(event.data);
        if (message.t === 'hello') {
          setStatus(message.canControl ? 'live' : 'view_only');
          if (message.url) setUrl(message.url);
        } else if (message.t === 'frame') {
          pendingHeader = message;
        } else if (message.t === 'error') {
          setError(ERROR_MESSAGES[message.code] ?? `No se pudo conectar con el navegador (${message.code}).`);
        }
        return;
      }
      const header = pendingHeader;
      pendingHeader = null;
      const bitmap = await createImageBitmap(new Blob([event.data], { type: 'image/jpeg' }));
      if (disposed || !context) return;
      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      if (header?.url) setUrl(header.url);
      if (header?.inputSeq !== undefined && sentAt.has(header.inputSeq)) {
        setLatency(Math.round(performance.now() - sentAt.get(header.inputSeq)!));
        sentAt.delete(header.inputSeq);
      }
    };
    socket.onclose = (event) => {
      if (disposed) return;
      setStatus(event.code === 4403 ? 'error' : 'closed');
      if (event.reason && ERROR_MESSAGES[event.reason]) setError(ERROR_MESSAGES[event.reason]);
    };
    socket.onerror = () => { if (!disposed) setStatus('error'); };

    let seq = 0;
    let lastMove = 0;
    const send = (message: unknown) => { if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message)); };
    const point = (event: MouseEvent) => toPagePoint(event.clientX, event.clientY, canvas.getBoundingClientRect(), viewport);
    const button = (event: MouseEvent) => (event.button === 2 ? 'right' : event.button === 1 ? 'middle' : 'left');

    const onDown = (event: MouseEvent) => {
      canvas.focus();
      seq += 1;
      sentAt.set(seq, performance.now());
      send({ t: 'mouse', type: 'mousePressed', ...point(event), button: button(event), clickCount: event.detail || 1, seq });
      event.preventDefault();
    };
    const onUp = (event: MouseEvent) => send({ t: 'mouse', type: 'mouseReleased', ...point(event), button: button(event), clickCount: event.detail || 1 });
    const onMove = (event: MouseEvent) => {
      const now = performance.now();
      if (now - lastMove < MOVE_THROTTLE_MS) return;
      lastMove = now;
      send({ t: 'mouse', type: 'mouseMoved', ...point(event) });
    };
    const onWheel = (event: WheelEvent) => {
      send({ t: 'wheel', ...point(event), dx: event.deltaX, dy: event.deltaY });
      event.preventDefault();
    };
    const onKey = (event: KeyboardEvent) => {
      // Ctrl/Cmd+V is handled by the paste event (it carries the clipboard text).
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'v') return;
      if (event.type === 'keydown') { seq += 1; sentAt.set(seq, performance.now()); }
      const message = keyMessage({ type: event.type as 'keydown' | 'keyup', key: event.key, code: event.code, keyCode: event.keyCode, altKey: event.altKey, ctrlKey: event.ctrlKey, metaKey: event.metaKey, shiftKey: event.shiftKey }, event.type === 'keydown' ? seq : undefined);
      if (message) send(message);
      event.preventDefault();
    };
    const onPaste = (event: ClipboardEvent) => {
      const text = event.clipboardData?.getData('text/plain');
      if (text) send({ t: 'text', text: text.slice(0, 2000) });
      event.preventDefault();
    };
    const onContextMenu = (event: MouseEvent) => event.preventDefault();

    canvas.addEventListener('mousedown', onDown);
    canvas.addEventListener('mouseup', onUp);
    canvas.addEventListener('mousemove', onMove);
    canvas.addEventListener('wheel', onWheel, { passive: false });
    canvas.addEventListener('keydown', onKey);
    canvas.addEventListener('keyup', onKey);
    canvas.addEventListener('paste', onPaste);
    canvas.addEventListener('contextmenu', onContextMenu);
    const ping = window.setInterval(() => send({ t: 'ping', ts: performance.now() }), 15_000);

    return () => {
      disposed = true;
      window.clearInterval(ping);
      canvas.removeEventListener('mousedown', onDown);
      canvas.removeEventListener('mouseup', onUp);
      canvas.removeEventListener('mousemove', onMove);
      canvas.removeEventListener('wheel', onWheel);
      canvas.removeEventListener('keydown', onKey);
      canvas.removeEventListener('keyup', onKey);
      canvas.removeEventListener('paste', onPaste);
      canvas.removeEventListener('contextmenu', onContextMenu);
      socket.close();
      socketRef.current = null;
    };
  }, [recordingId, viewport]);

  const navigate = (action: 'back' | 'reload') => {
    const socket = socketRef.current;
    if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ t: 'nav', action }));
  };
  const canControl = status === 'live';

  return (
    <div className="mt-4 rounded-xl border border-[#E3E8EC] bg-[#0f1115] overflow-hidden" data-testid="live-browser-view">
      <div className="flex items-center gap-2 px-3 py-2 bg-[#1a1f2e] text-[11px] text-[#c9d1d9]">
        <button type="button" onClick={() => navigate('back')} disabled={!canControl} className="p-1 rounded hover:bg-white/10 disabled:opacity-40" aria-label="Atrás">
          <ArrowLeft size={13} />
        </button>
        <button type="button" onClick={() => navigate('reload')} disabled={!canControl} className="p-1 rounded hover:bg-white/10 disabled:opacity-40" aria-label="Recargar">
          <RotateCw size={13} />
        </button>
        <span className="flex-1 truncate font-mono" title={url}>{url || '…'}</span>
        {status === 'connecting' && <span className="flex items-center gap-1"><Loader2 size={12} className="animate-spin" /> Conectando…</span>}
        {status === 'view_only' && <span className="flex items-center gap-1 text-[#f2cc60]"><Eye size={12} /> Solo lectura</span>}
        {status === 'live' && latency !== null && <span className="text-[#8b949e]">{latency} ms</span>}
      </div>
      {error && <div className="px-3 py-2 text-[12px] text-[#ffb4a9] bg-[#3a1d1d]">{error}</div>}
      {status === 'closed' && !error && <div className="px-3 py-2 text-[12px] text-[#c9d1d9]">La conexión con el navegador se cerró.</div>}
      <div className="flex justify-center bg-black">
        <canvas
          ref={canvasRef}
          width={viewport.width}
          height={viewport.height}
          tabIndex={0}
          aria-label="Navegador de la grabación. Haz clic para interactuar."
          className="block max-w-full h-auto outline-none focus:ring-2 focus:ring-[#48A157]"
          style={{ aspectRatio: `${viewport.width} / ${viewport.height}`, maxHeight: '75vh', cursor: canControl ? 'default' : 'not-allowed' }}
        />
      </div>
    </div>
  );
}
