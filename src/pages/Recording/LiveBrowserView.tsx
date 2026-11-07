import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, Loader2, RotateCw, Eye, ExternalLink, Plus, Upload, ArrowRight } from 'lucide-react';
import { getToken } from '../../services/http';
import { keyMessage, liveViewSocketUrl, toPagePoint, type Viewport } from './live-view-input';

/**
 * The recording browser of a "remote" recording, streamed from the server into this panel.
 *
 * Frames arrive as JPEG over a WebSocket and are drawn on a canvas; the person's mouse, wheel,
 * keyboard and paste go back to the server browser, where Capture V2 records them exactly like
 * clicks on a visible browser. The OS cursor stays local, so pointing never waits on the network.
 */

type Status = 'connecting' | 'loading' | 'live' | 'view_only' | 'closed' | 'error';
type BrowserTab = { pageKey: string; url: string; title: string };

const MOVE_THROTTLE_MS = 33;
const API_BASE = import.meta.env.VITE_API_URL ?? '';

const ERROR_MESSAGES: Record<string, string> = {
  missing_token: 'Tu sesión no es válida. Vuelve a iniciar sesión.',
  invalid_token: 'Tu sesión expiró. Vuelve a iniciar sesión.',
  password_change_required: 'Debes cambiar tu contraseña antes de grabar.',
  forbidden: 'No tienes acceso a esta grabación.',
  recording_closed: 'La grabación terminó.',
  stream_unavailable: 'No se pudo transmitir el navegador. Revisa la conexión con el backend.',
  initial_navigation_failed: 'Chromium no pudo cargar la aplicación inicial. Revisa el backend y vuelve a iniciar la grabación.',
};

export function LiveBrowserView({ recordingId, viewport }: { recordingId: string; viewport: Viewport }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const [status, setStatus] = useState<Status>('connecting');
  const [error, setError] = useState<string | null>(null);
  const [url, setUrl] = useState('');
  const [latency, setLatency] = useState<number | null>(null);
  const [connectionAttempt, setConnectionAttempt] = useState(0);
  const [tabs, setTabs] = useState<BrowserTab[]>([]);
  const [selectedPageKey, setSelectedPageKey] = useState('tab-1');
  const [address, setAddress] = useState('');
  const [fileChooserPageKey, setFileChooserPageKey] = useState<string | null>(null);
  const [fileChooserMultiple, setFileChooserMultiple] = useState(false);
  const [uploadingFiles, setUploadingFiles] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadSuccess, setUploadSuccess] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext('2d');
    const socket = new WebSocket(liveViewSocketUrl(recordingId, API_BASE, window.location));
    socket.binaryType = 'arraybuffer';
    socketRef.current = socket;
    type FrameHeader = { frameId?: number; inputSeq?: number; url?: string; pageKey?: string };
    let pendingHeader: FrameHeader | null = null;
    let pendingImage: { data: ArrayBuffer; header: FrameHeader | null } | null = null;
    let decoding = false;
    const sentAt = new Map<number, number>();
    let disposed = false;
    let pageViewport = viewport;
    let controlAllowed = false;
    setStatus('connecting');
    setError(null);

    const acknowledge = (header: FrameHeader | null) => {
      if (header?.frameId !== undefined && socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ t: 'frame_ack', frameId: header.frameId }));
      }
    };
    const drawPendingImages = async () => {
      if (decoding) return;
      decoding = true;
      try {
        while (pendingImage && !disposed) {
          const image = pendingImage;
          pendingImage = null;
          let bitmap: ImageBitmap | undefined;
          try {
            bitmap = await createImageBitmap(new Blob([image.data], { type: 'image/jpeg' }));
            if (disposed || !context) continue;
            // Always draw the completed image; continuous arrivals cannot starve painting.
            context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
            if (image.header?.url) setUrl(image.header.url);
            if (image.header?.pageKey) setSelectedPageKey(image.header.pageKey);
            const inputSeq = image.header?.inputSeq;
            if (inputSeq !== undefined && sentAt.has(inputSeq)) {
              setLatency(Math.round(performance.now() - sentAt.get(inputSeq)!));
              for (const key of sentAt.keys()) if (key <= inputSeq) sentAt.delete(key);
            }
          } catch {
            // A damaged visual frame must not stop delivery of later images.
          } finally {
            bitmap?.close();
            if (!disposed) acknowledge(image.header);
          }
        }
      } finally {
        decoding = false;
      }
    };
    socket.onopen = () => socket.send(JSON.stringify({ t: 'auth', token: getToken(), frameAcknowledgements: true }));
    socket.onmessage = async (event) => {
      if (disposed) return;
      if (typeof event.data === 'string') {
        const message = JSON.parse(event.data);
        if (message.t === 'hello') {
          const ready = message.ready !== false;
          controlAllowed = ready && message.canControl === true;
          if (message.viewport?.width > 0 && message.viewport?.height > 0) {
            pageViewport = message.viewport;
            canvas.width = pageViewport.width;
            canvas.height = pageViewport.height;
            canvas.style.aspectRatio = `${pageViewport.width} / ${pageViewport.height}`;
          }
          setStatus(!ready ? 'loading' : controlAllowed ? 'live' : 'view_only');
          if (message.url) setUrl(message.url);
          if (Array.isArray(message.tabs)) setTabs(message.tabs);
          if (message.pageKey) setSelectedPageKey(message.pageKey);
          if (message.fileChooserAvailable === true) setFileChooserPageKey(message.fileChooserPageKey ?? message.pageKey ?? 'tab-1');
          setFileChooserMultiple(message.fileChooserAvailable === true && message.fileChooserMultiple === true);
        } else if (message.t === 'tabs') {
          if (Array.isArray(message.tabs)) setTabs(message.tabs);
          if (message.selectedPageKey) setSelectedPageKey(message.selectedPageKey);
        } else if (message.t === 'selected_tab') {
          if (message.pageKey) setSelectedPageKey(message.pageKey);
          if (message.url) setUrl(message.url);
        } else if (message.t === 'file_chooser') {
          setFileChooserPageKey(message.available ? (message.pageKey ?? selectedPageKey) : null);
          setFileChooserMultiple(message.available === true && message.multiple === true);
          setUploadError(null);
          setUploadSuccess(null);
          // The page's own dialog belongs to the server's browser. The user just clicked the field, so open the local
          // explorer right away (after React applies `multiple`); if the browser denies it, the panel button still works.
          if (message.available === true) {
            setTimeout(() => { try { fileInputRef.current?.click(); } catch { /* the "Elegir archivo(s)" button remains */ } }, 60);
          }
        } else if (message.t === 'ready') {
          controlAllowed = message.canControl === true;
          setStatus(controlAllowed ? 'live' : 'view_only');
        } else if (message.t === 'frame') {
          pendingHeader = message;
        } else if (message.t === 'error') {
          setError(ERROR_MESSAGES[message.code] ?? `No se pudo conectar con el navegador (${message.code}).`);
        }
        return;
      }
      if (pendingImage) acknowledge(pendingImage.header);
      pendingImage = { data: event.data as ArrayBuffer, header: pendingHeader };
      pendingHeader = null;
      void drawPendingImages();
    };
    socket.onclose = (event) => {
      if (disposed) return;
      setStatus(event.code === 4403 ? 'error' : 'closed');
      if (event.reason && ERROR_MESSAGES[event.reason]) setError(ERROR_MESSAGES[event.reason]);
    };
    socket.onerror = () => { if (!disposed) setStatus('error'); };

    let seq = 0;
    let lastMove = 0;
    let pressedButton = false;
    const send = (message: unknown) => { if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message)); };
    const point = (event: MouseEvent) => toPagePoint(event.clientX, event.clientY, canvas.getBoundingClientRect(), pageViewport);
    const button = (event: MouseEvent) => (event.button === 2 ? 'right' : event.button === 1 ? 'middle' : 'left');

    const onDown = (event: MouseEvent) => {
      if (!controlAllowed) return;
      pressedButton = true;
      canvas.focus();
      seq += 1;
      sentAt.set(seq, performance.now());
      send({ t: 'mouse', type: 'mousePressed', ...point(event), button: button(event), clickCount: event.detail || 1, seq });
      event.preventDefault();
    };
    const onUp = (event: MouseEvent) => {
      if (!pressedButton) return;
      pressedButton = false;
      send({ t: 'mouse', type: 'mouseReleased', ...point(event), button: button(event), clickCount: event.detail || 1 });
    };
    const onMove = (event: MouseEvent) => {
      if (!controlAllowed) return;
      const now = performance.now();
      if (now - lastMove < MOVE_THROTTLE_MS) return;
      lastMove = now;
      send({ t: 'mouse', type: 'mouseMoved', ...point(event) });
    };
    const onWheel = (event: WheelEvent) => {
      if (!controlAllowed) return;
      send({ t: 'wheel', ...point(event), dx: event.deltaX, dy: event.deltaY });
      event.preventDefault();
    };
    const onKey = (event: KeyboardEvent) => {
      if (!controlAllowed) return;
      // Ctrl/Cmd+V is handled by the paste event (it carries the clipboard text).
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'v') return;
      if (event.type === 'keydown') { seq += 1; sentAt.set(seq, performance.now()); }
      const message = keyMessage({ type: event.type as 'keydown' | 'keyup', key: event.key, code: event.code, keyCode: event.keyCode, altKey: event.altKey, ctrlKey: event.ctrlKey, metaKey: event.metaKey, shiftKey: event.shiftKey }, event.type === 'keydown' ? seq : undefined);
      if (message) send(message);
      event.preventDefault();
    };
    const onPaste = (event: ClipboardEvent) => {
      if (!controlAllowed) return;
      const text = event.clipboardData?.getData('text/plain');
      if (text) send({ t: 'text', text: text.slice(0, 2000) });
      event.preventDefault();
    };
    const onContextMenu = (event: MouseEvent) => event.preventDefault();

    canvas.addEventListener('mousedown', onDown);
    window.addEventListener('mouseup', onUp);
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
      window.removeEventListener('mouseup', onUp);
      canvas.removeEventListener('mousemove', onMove);
      canvas.removeEventListener('wheel', onWheel);
      canvas.removeEventListener('keydown', onKey);
      canvas.removeEventListener('keyup', onKey);
      canvas.removeEventListener('paste', onPaste);
      canvas.removeEventListener('contextmenu', onContextMenu);
      socket.close();
      socketRef.current = null;
    };
  }, [recordingId, viewport, connectionAttempt]);

  const navigateHistory = (action: 'back' | 'reload') => {
    const socket = socketRef.current;
    if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ t: 'nav', action }));
  };
  const sendNavigation = (newTab: boolean) => {
    const url = address.trim();
    const socket = socketRef.current;
    if (!url || socket?.readyState !== WebSocket.OPEN) return;
    socket.send(JSON.stringify({ t: 'navigate', url, newTab }));
    setAddress('');
  };
  const chooseTab = (pageKey: string) => {
    const socket = socketRef.current;
    if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ t: 'select_tab', pageKey }));
  };
  const uploadSelectedFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    setUploadingFiles(true);
    setUploadError(null);
    setUploadSuccess(null);
    try {
      const form = new FormData();
      Array.from(files).forEach((file) => form.append('files', file, file.name));
      const token = getToken();
      const response = await fetch(`${API_BASE}/api/recordings/${encodeURIComponent(recordingId)}/live-files`, {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        body: form,
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.message || payload.error || `No se pudieron adjuntar los archivos (${response.status})`);
      const names = Array.isArray(payload.files) ? payload.files.join(', ') : `${files.length} archivo(s)`;
      setUploadSuccess(`Adjuntado: ${names}`);
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'No se pudieron adjuntar los archivos');
    } finally {
      setUploadingFiles(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };
  const canControl = status === 'live';

  return (
    <div className="mt-4 rounded-xl border border-[#E3E8EC] bg-[#0f1115] overflow-hidden" data-testid="live-browser-view">
      <div className="flex items-center gap-2 px-3 py-2 bg-[#1a1f2e] text-[11px] text-[#c9d1d9]">
        <button type="button" onClick={() => navigateHistory('back')} disabled={!canControl} className="p-1 rounded hover:bg-white/10 disabled:opacity-40" aria-label="Atrás">
          <ArrowLeft size={13} />
        </button>
        <button type="button" onClick={() => navigateHistory('reload')} disabled={!canControl} className="p-1 rounded hover:bg-white/10 disabled:opacity-40" aria-label="Recargar">
          <RotateCw size={13} />
        </button>
        <span className="flex-1 truncate font-mono" title={url}>{url || '…'}</span>
        {status === 'connecting' && <span className="flex items-center gap-1"><Loader2 size={12} className="animate-spin" /> Conectando…</span>}
        {status === 'loading' && <span className="flex items-center gap-1"><Loader2 size={12} className="animate-spin" /> Cargando aplicación…</span>}
        {status === 'view_only' && <span className="flex items-center gap-1 text-[#f2cc60]"><Eye size={12} /> Solo lectura</span>}
        {status === 'live' && latency !== null && <span className="text-[#8b949e]">{latency} ms</span>}
        {(status === 'closed' || status === 'error') && (
          <button type="button" onClick={() => setConnectionAttempt(attempt => attempt + 1)} className="rounded px-2 py-1 hover:bg-white/10">
            Reconectar
          </button>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2 px-3 py-2 bg-[#151a24] border-t border-white/10">
        <form className="flex min-w-[240px] flex-1 gap-2" onSubmit={(event) => { event.preventDefault(); sendNavigation(false); }}>
          <input
            aria-label="Link de navegación"
            value={address}
            onChange={(event) => setAddress(event.target.value)}
            placeholder="https://ejemplo.com"
            disabled={!canControl}
            className="min-w-0 flex-1 rounded-md border border-white/15 bg-[#0f1115] px-2 py-1.5 font-mono text-[11px] text-white placeholder:text-[#77808d] disabled:opacity-50"
          />
          <button type="submit" disabled={!canControl || !address.trim()} className="inline-flex items-center gap-1 rounded-md bg-[#26364a] px-2 py-1.5 text-[11px] text-white disabled:opacity-40" title="Navegar en la pestaña actual">
            <ArrowRight size={12} /> Ir
          </button>
          <button type="button" onClick={() => sendNavigation(true)} disabled={!canControl || !address.trim()} className="inline-flex items-center gap-1 rounded-md bg-[#26364a] px-2 py-1.5 text-[11px] text-white disabled:opacity-40" title="Abrir link en una pestaña nueva">
            <Plus size={12} /> Nueva pestaña
          </button>
        </form>
        <div className="flex flex-wrap items-center gap-1" aria-label="Pestañas del navegador">
          {tabs.map((tab) => (
            <button key={tab.pageKey} type="button" onClick={() => chooseTab(tab.pageKey)} disabled={!canControl} title={tab.url} aria-pressed={selectedPageKey === tab.pageKey}
              className={`max-w-[180px] truncate rounded-md px-2 py-1.5 text-[11px] ${selectedPageKey === tab.pageKey ? 'bg-[#48A157] text-white' : 'bg-white/5 text-[#c9d1d9] hover:bg-white/10'} disabled:opacity-50`}>
              <ExternalLink size={11} className="mr-1 inline" />{tab.title || tab.pageKey}
            </button>
          ))}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2 px-3 py-2 bg-[#1a1f2e] text-[11px] text-[#c9d1d9]">
        <input ref={fileInputRef} type="file" multiple={fileChooserMultiple} className="hidden" aria-label="Seleccionar documentos para la grabación" onChange={(event) => { void uploadSelectedFiles(event.currentTarget.files); }} />
        <button type="button" onClick={() => fileInputRef.current?.click()} disabled={!canControl || !fileChooserPageKey || uploadingFiles}
          className="inline-flex items-center gap-1 rounded-md border border-white/15 px-2 py-1.5 disabled:opacity-40" title="Primero activa un campo de archivo en la página">
          {uploadingFiles ? <Loader2 size={12} className="animate-spin" /> : <Upload size={12} />}
          {uploadingFiles ? 'Adjuntando…' : 'Elegir archivo(s)'}
        </button>
        <span className="text-[#8b949e]">{fileChooserPageKey ? `Campo de archivo activo en ${fileChooserPageKey}. ${fileChooserMultiple ? 'Puedes seleccionar varios documentos.' : 'Este campo acepta un solo documento.'}` : 'Haz clic en un campo de archivo dentro de la página y luego selecciónalos aquí.'}</span>
        {uploadError && <span role="alert" className="text-[#ffb4a9]">{uploadError}</span>}
        {uploadSuccess && <span role="status" className="text-[#8de09b]">{uploadSuccess}</span>}
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
