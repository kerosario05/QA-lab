import { useEffect, useState } from 'react';
import { AlertCircle, Download, Loader2, Monitor, Play, Server, Smartphone } from 'lucide-react';
import { cn } from '../../constants/theme';
import { appiumNote, bootableAvds, deviceOptions, emulatorProgress, pickSerial } from './device-choice';
import { useAgentDevices } from './useAgentDevices';
import { useLocalAgent } from './LocalAgentContext';

/**
 * "Dispositivo" for mobile recordings and launches: the emulators and phones on the user's
 * PC (Android Studio, through the QA Lab agent), or the server's emulator when there are none.
 * `value` is the chosen serial; null means the server's emulator.
 */
export function DevicePicker({ value, onChange, purpose, disabled = false }: {
  value: string | null;
  onChange: (serial: string | null) => void;
  purpose: 'record' | 'launch';
  disabled?: boolean;
}) {
  const devices = useAgentDevices(!disabled);
  const { offerUpdate } = useLocalAgent();
  const [userChoseServer, setUserChoseServer] = useState(false);
  const options = deviceOptions(devices.android, devices.emulator);
  const avds = bootableAvds(devices.android);
  const progress = emulatorProgress(devices.emulator);
  const next = pickSerial(options, value, userChoseServer);

  // Follows the PC: a chosen emulator that closes falls back, a new one is picked up.
  useEffect(() => {
    if (!disabled && devices.loaded && next !== value) onChange(next);
  }, [disabled, devices.loaded, next, value, onChange]);

  if (!devices.loaded) {
    return <div className="flex items-center gap-2 text-[12px] text-[#8B999D]"><Loader2 size={13} className="animate-spin" /> Buscando dispositivos de tu equipo…</div>;
  }

  const choose = (serial: string | null) => {
    setUserChoseServer(serial === null);
    onChange(serial);
  };

  const noAgent = devices.pairing !== 'found';
  const noAndroid = !noAgent && !devices.android;

  return (
    <div className="space-y-2" role="radiogroup" aria-label="Dispositivo">
      {options.map((o) => (
        <button
          key={o.serial}
          type="button"
          role="radio"
          aria-checked={value === o.serial}
          disabled={disabled || !o.usable}
          onClick={() => choose(o.serial)}
          className={cn(
            'w-full flex items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition',
            value === o.serial ? 'border-[#104B99] bg-[#104B99]/[0.06]' : 'border-[#E8EBEC] bg-white hover:border-[#104B99]/40',
            !o.usable && 'opacity-70 cursor-not-allowed hover:border-[#E8EBEC]',
          )}
        >
          {o.kind === 'emulator' ? <Monitor size={16} className="text-[#58646D] flex-shrink-0" /> : <Smartphone size={16} className="text-[#58646D] flex-shrink-0" />}
          <span className="min-w-0 flex-1">
            <span className="block text-[13px] font-medium text-[#1a1f2e] truncate">{o.label}</span>
            <span className="block text-[11px] text-[#8B999D] font-mono truncate">{o.serial}{o.kind === 'physical' ? ' · teléfono' : ' · emulador'}</span>
            {o.note && <span className="block text-[11px] text-[#B4463C]">{o.note}</span>}
          </span>
        </button>
      ))}

      {avds.length > 0 && (
        <div className="rounded-xl border border-dashed border-[#BABEC3] px-3 py-2.5">
          <div className="text-[11px] text-[#58646D] mb-2">{options.length === 0 ? 'No hay ningún emulador abierto. Abre uno de Android Studio:' : 'Otros emuladores de tu equipo:'}</div>
          <div className="flex flex-wrap gap-2">
            {avds.map((avd) => {
              const busy = devices.starting === avd || (devices.emulator?.avd === avd && !['ready', 'error'].includes(devices.emulator.state));
              return (
                <button
                  key={avd}
                  type="button"
                  disabled={disabled || busy}
                  onClick={() => void devices.startEmulator(avd)}
                  className="inline-flex items-center gap-1.5 rounded-full border border-[#E8EBEC] bg-white px-3 py-1.5 text-[11px] font-medium text-[#1a1f2e] hover:border-[#104B99]/40 disabled:opacity-60 transition"
                >
                  {busy ? <Loader2 size={12} className="animate-spin" /> : <Play size={12} />} {avd.replace(/_/g, ' ')}
                </button>
              );
            })}
          </div>
        </div>
      )}
      {progress && <div className={cn('flex items-center gap-1.5 text-[11px]', devices.emulator?.state === 'error' ? 'text-[#E63946]' : 'text-[#58646D]')}>{devices.emulator?.state === 'error' ? <AlertCircle size={12} /> : <Loader2 size={12} className="animate-spin" />} {progress}</div>}
      {devices.error && <div className="flex items-center gap-1.5 text-[11px] text-[#E63946]"><AlertCircle size={12} /> {devices.error}</div>}

      {(noAgent || noAndroid) && (
        <div className="rounded-xl bg-[#FAFAF7] px-3 py-2.5 text-[11px] text-[#58646D]">
          {noAgent
            ? 'Para usar el emulador o teléfono de tu equipo necesitas el agente de QA Lab abierto en tu PC.'
            : 'El agente de tu equipo no encontró Android Studio (SDK con adb). Instálalo o actualiza el agente.'}
        </div>
      )}
      {purpose === 'launch' && value && (
        <div className="text-[11px] text-[#8B999D]">{appiumNote(devices.agent?.appium)}</div>
      )}
      {devices.agent?.updateAvailable && (
        <button
          type="button"
          onClick={offerUpdate}
          className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-[#104B99] hover:underline"
        >
          <Download size={12} /> Actualizar el agente de tu equipo ({devices.agent.agentVersion} → {devices.agent.latestVersion})
        </button>
      )}

      <button
        type="button"
        role="radio"
        aria-checked={value === null}
        disabled={disabled}
        onClick={() => choose(null)}
        className={cn(
          'w-full flex items-center gap-3 rounded-xl border px-3 py-2 text-left transition',
          value === null ? 'border-[#104B99] bg-[#104B99]/[0.06]' : 'border-[#E8EBEC] bg-white hover:border-[#104B99]/40',
        )}
      >
        <Server size={15} className="text-[#58646D] flex-shrink-0" />
        <span className="text-[12px] text-[#1a1f2e]">Emulador del servidor</span>
      </button>
    </div>
  );
}
