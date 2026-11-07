/**
 * Lo que el formulario necesita del APK de un proyecto móvil. El APK vive en el servidor y se
 * instala por el túnel del agente en el emulador o teléfono que el usuario elige al grabar o
 * lanzar pruebas, así que aquí no se configura emulador ni Appium.
 */

export interface ApkInspection {
  apkPath: string;
  packageName: string;
  mainActivity: string;
  versionName?: string;
  versionCode?: string;
  minSdk?: string;
  targetSdk?: string;
  inspectionSource?: string;
}

// Las subidas se guardan como `<uuid>-<nombre>.apk`; al usuario solo le importa el nombre.
const UPLOAD_PREFIX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}-/i;

export function apkDisplayName(apkPath: string): string {
  const base = apkPath.trim().split(/[\\/]/).pop() ?? '';
  return base.replace(UPLOAD_PREFIX, '');
}

const ANDROID_RELEASE: Record<number, string> = {
  21: '5.0', 22: '5.1', 23: '6', 24: '7.0', 25: '7.1', 26: '8.0', 27: '8.1', 28: '9',
  29: '10', 30: '11', 31: '12', 32: '12L', 33: '13', 34: '14', 35: '15', 36: '16',
};

function androidLabel(sdk: string | undefined): string | undefined {
  const level = Number.parseInt(sdk ?? '', 10);
  if (!Number.isFinite(level)) return undefined;
  const release = ANDROID_RELEASE[level];
  return release ? `Android ${release} (API ${level})` : `API ${level}`;
}

/** Líneas cortas para la tarjeta del APK detectado; omite lo que el APK no declara. */
export function apkDetails(apk: Partial<ApkInspection>): string[] {
  const lines: string[] = [];
  if (apk.versionName || apk.versionCode) {
    const code = apk.versionCode ? ` (build ${apk.versionCode})` : '';
    lines.push(`Versión ${apk.versionName ?? '—'}${code}`);
  }
  const min = androidLabel(apk.minSdk);
  if (min) lines.push(`Requiere ${min} o superior`);
  return lines;
}

/** Errores del APK por campo; vacío cuando el proyecto puede guardarse. */
export function apkValidationErrors(apkPath: string, packageName: string, mainActivity: string): Record<string, string> {
  const errs: Record<string, string> = {};
  if (!apkPath.trim()) errs.apkPath = 'Sube el APK de la app';
  else if (!packageName.trim()) errs.packageName = 'No se detectó el package; revisa las opciones avanzadas';
  if (apkPath.trim() && !mainActivity.trim()) errs.mainActivity = 'No se detectó la actividad principal; complétala en las opciones avanzadas';
  return errs;
}
