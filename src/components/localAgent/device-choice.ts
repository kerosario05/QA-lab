import type { AgentEmulatorState, AndroidStatus } from '../../services/localAgent';

/**
 * Which Android device a mobile recording or launch runs on: a phone or emulator on the
 * user's own PC (through the QA Lab agent) or, when there is none, the server's emulator.
 */

export type DeviceOption = {
  serial: string;
  label: string;
  kind: 'emulator' | 'physical';
  usable: boolean;
  /** Why it cannot be used yet, in words the user can act on. */
  note?: string;
};

function stateNote(state: string): string | undefined {
  if (state === 'device') return undefined;
  if (state === 'unauthorized') return 'Acepta la depuración USB en el teléfono';
  if (state === 'offline') return 'Sin conexión: reconéctalo o reinicia el emulador';
  return `Estado ${state}`;
}

/**
 * `emulator`: the one the panel asked to start. While it boots adb lists it as "offline"
 * (and without its AVD name), which is not something the user has to fix.
 */
export function deviceOptions(android: AndroidStatus | null | undefined, emulator?: AgentEmulatorState | null): DeviceOption[] {
  const booting = emulator && !['ready', 'error'].includes(emulator.state) ? emulator : null;
  return (android?.devices ?? []).map((d) => {
    const isBooting = Boolean(booting && d.kind === 'emulator' && d.state !== 'device' && (!d.avd || d.avd === booting.avd));
    const avd = d.avd || (isBooting ? booting!.avd : undefined);
    return {
      serial: d.serial,
      label: d.kind === 'emulator' ? (avd || d.model || 'Emulador').replace(/_/g, ' ') : (d.model || 'Teléfono').replace(/_/g, ' '),
      kind: d.kind,
      usable: d.state === 'device',
      note: isBooting ? 'Arrancando… (tarda uno o dos minutos)' : stateNote(d.state),
    };
  });
}

/** AVDs of Android Studio that are not running yet, so they can be started from the panel. */
export function bootableAvds(android: AndroidStatus | null | undefined): string[] {
  const running = new Set((android?.devices ?? []).map((d) => d.avd).filter(Boolean));
  return (android?.avds ?? []).filter((avd) => !running.has(avd));
}

/**
 * Keeps the user's choice while it is still usable; otherwise picks the first usable device
 * (a freshly started emulator, a phone just authorized). null means the server's emulator.
 */
export function pickSerial(options: DeviceOption[], current: string | null, userChoseServer: boolean): string | null {
  if (userChoseServer) return null;
  if (current && options.some((o) => o.serial === current && o.usable)) return current;
  return options.find((o) => o.usable)?.serial ?? null;
}

type AppiumView = { managed: boolean; installed: boolean; install: { state: string; percent: number; message?: string } | null };

/** What running tests on the user's PC needs from Appium, in their words. */
export function appiumNote(appium: AppiumView | null | undefined): string {
  if (!appium?.managed) {
    return 'Para ejecutar, abre Appium en tu equipo (puerto 4723) o actualiza el agente de QA Lab, que lo prepara solo.';
  }
  if (appium.installed) return 'Appium se abre solo en tu equipo al ejecutar. La app se instala sola en el dispositivo.';
  const install = appium.install;
  if (install?.state === 'error') return `No se pudo preparar Appium en tu equipo: ${install.message ?? 'error desconocido'}. Se reintentará al ejecutar.`;
  if (install && install.state !== 'done') return `Preparando Appium en tu equipo (${install.percent} %)…`;
  return 'Appium se instalará solo en tu equipo la primera vez que ejecutes (unos minutos).';
}

export function emulatorProgress(emulator: AgentEmulatorState | null | undefined): string | null {
  if (!emulator) return null;
  if (emulator.state === 'error') return emulator.message ?? `No se pudo arrancar ${emulator.avd}`;
  if (emulator.state === 'ready') return null;
  return emulator.state === 'booting' ? `Arrancando ${emulator.avd}…` : `Abriendo ${emulator.avd}…`;
}
