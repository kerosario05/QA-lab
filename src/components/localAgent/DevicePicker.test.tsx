import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AndroidStatus, LocalAgentStatus } from '../../services/localAgent';
import { appiumNote, bootableAvds, deviceOptions, emulatorProgress, pickSerial } from './device-choice';

const api = vi.hoisted(() => ({
  status: vi.fn(),
  startEmulator: vi.fn(),
}));
vi.mock('../../services/localAgent', () => ({ localAgentApi: api }));

const { DevicePicker } = await import('./DevicePicker');

const ANDROID: AndroidStatus = {
  sdkFound: true,
  emulatorFound: true,
  avds: ['Pixel_6_Pro', 'Pixel_8'],
  devices: [
    { serial: 'R58M123', state: 'unauthorized', kind: 'physical', model: 'SM_A546' },
    { serial: 'emulator-5554', state: 'device', kind: 'emulator', avd: 'Pixel_6_Pro', model: 'sdk_gphone64' },
  ],
  checkedAt: '2026-11-04T10:00:00Z',
};

function agentStatus(android: AndroidStatus | null, extra: Partial<LocalAgentStatus> = {}): LocalAgentStatus {
  return {
    requiredRevision: '1',
    pairing: 'found',
    agent: { agentId: 'agente-1', machine: 'PC', windowsUser: 'qa', agentVersion: '0.2.0', chromiumInstalled: true, androidReady: !!android, android },
    install: null,
    ready: true,
    ...extra,
  };
}

let root: Root | undefined;
let container: HTMLDivElement | undefined;
let chosen: Array<string | null> = [];

async function render(value: string | null = null) {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root!.render(<DevicePicker value={value} onChange={(s) => chosen.push(s)} purpose="launch" />);
  });
  await act(async () => { await vi.advanceTimersByTimeAsync(10); });
}

beforeEach(() => {
  vi.useFakeTimers();
  chosen = [];
});

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  vi.useRealTimers();
  api.status.mockReset();
  api.startEmulator.mockReset();
});

describe('DevicePicker', () => {
  it('lista los dispositivos del equipo y elige solo el primero que se puede usar', async () => {
    api.status.mockResolvedValue(agentStatus(ANDROID));
    await render();
    expect(container!.textContent).not.toContain('Actualizar el agente');

    expect(container!.textContent).toContain('Pixel 6 Pro');
    expect(container!.textContent).toContain('Acepta la depuración USB en el teléfono');
    expect(chosen).toEqual(['emulator-5554']);
    const phone = [...container!.querySelectorAll('button[role="radio"]')].find((b) => b.textContent?.includes('R58M123'));
    expect((phone as HTMLButtonElement).disabled).toBe(true);
  });

  it('ofrece arrancar los emuladores de Android Studio que no están abiertos', async () => {
    api.status.mockResolvedValue(agentStatus({ ...ANDROID, devices: [] }));
    api.startEmulator.mockResolvedValue({ ok: true, emulator: { requestId: 'r', avd: 'Pixel_8', state: 'starting' } });
    await render();

    expect(container!.textContent).toContain('No hay ningún emulador abierto');
    expect(chosen).toEqual([]);
    const start = [...container!.querySelectorAll('button')].find((b) => b.textContent?.includes('Pixel 8'))!;
    await act(async () => { start.click(); });
    expect(api.startEmulator).toHaveBeenCalledWith('Pixel_8');
  });

  it('sin agente usa el emulador del servidor y explica qué falta', async () => {
    api.status.mockResolvedValue({ requiredRevision: '1', pairing: 'none', agent: null, install: null, ready: false });
    await render();
    expect(container!.textContent).toContain('necesitas el agente de QA Lab');
    expect(chosen).toEqual([]);
    const server = [...container!.querySelectorAll('button[role="radio"]')].find((b) => b.textContent?.includes('Emulador del servidor'))!;
    expect(server.getAttribute('aria-checked')).toBe('true');
  });

  it('con un agente antiguo ofrece actualizarlo desde el selector', async () => {
    const old = agentStatus(ANDROID);
    old.agent = { ...old.agent!, latestVersion: '0.3.0', updateAvailable: true };
    api.status.mockResolvedValue(old);
    await render();
    expect(container!.textContent).toContain('Actualizar el agente de tu equipo (0.2.0 → 0.3.0)');
    expect(api.status).toHaveBeenCalled();
  });

  it('si el dispositivo elegido desaparece vuelve al servidor', async () => {
    api.status.mockResolvedValue(agentStatus({ ...ANDROID, devices: [] }));
    await render('emulator-5554');
    expect(chosen).toEqual([null]);
  });
});

describe('device-choice', () => {
  it('bootableAvds excluye los emuladores que ya corren', () => {
    expect(bootableAvds(ANDROID)).toEqual(['Pixel_8']);
    expect(bootableAvds(null)).toEqual([]);
  });

  it('pickSerial respeta la elección del usuario mientras siga disponible', () => {
    const options = deviceOptions({ ...ANDROID, devices: [...ANDROID.devices, { serial: 'emulator-5556', state: 'device', kind: 'emulator', avd: 'Pixel_8' }] });
    expect(pickSerial(options, 'emulator-5556', false)).toBe('emulator-5556');
    expect(pickSerial(options, 'R58M123', false)).toBe('emulator-5554');
    expect(pickSerial(options, null, true)).toBeNull();
  });

  it('appiumNote: el agente nuevo prepara Appium solo; con uno viejo hay que abrirlo', () => {
    expect(appiumNote(undefined)).toContain('abre Appium en tu equipo (puerto 4723)');
    expect(appiumNote({ managed: false, installed: false, install: null })).toMatch(/actualiza el agente/);
    expect(appiumNote({ managed: true, installed: true, install: null })).toMatch(/se abre solo/);
    expect(appiumNote({ managed: true, installed: false, install: { state: 'download', percent: 42 } })).toBe('Preparando Appium en tu equipo (42 %)…');
    expect(appiumNote({ managed: true, installed: false, install: { state: 'error', percent: 0, message: 'disco lleno' } })).toMatch(/disco lleno.*reintentará/);
    expect(appiumNote({ managed: true, installed: false, install: null })).toMatch(/primera vez/);
  });

  it('deviceOptions: un emulador que arranca no se presenta como desconectado', () => {
    const android = { ...ANDROID, devices: [{ serial: 'emulator-5554', state: 'offline', kind: 'emulator' as const }] };
    const [booting] = deviceOptions(android, { requestId: 'r', avd: 'Pixel_8', state: 'booting' });
    expect(booting.label).toBe('Pixel 8');
    expect(booting.note).toMatch(/^Arrancando/);
    expect(booting.usable).toBe(false);
    expect(deviceOptions(android, null)[0].note).toMatch(/Sin conexión/);
    expect(deviceOptions(android, { requestId: 'r', avd: 'Pixel_8', state: 'error' })[0].note).toMatch(/Sin conexión/);
  });

  it('emulatorProgress solo habla mientras arranca o si falló', () => {
    expect(emulatorProgress({ requestId: 'r', avd: 'Pixel_8', state: 'booting' })).toBe('Arrancando Pixel_8…');
    expect(emulatorProgress({ requestId: 'r', avd: 'Pixel_8', state: 'ready' })).toBeNull();
    expect(emulatorProgress({ requestId: 'r', avd: 'Pixel_8', state: 'error', message: 'Sin aceleración' })).toBe('Sin aceleración');
  });
});
