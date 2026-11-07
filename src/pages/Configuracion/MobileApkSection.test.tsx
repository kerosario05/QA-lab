import { act, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MobileApkSection, type MobileApkValue } from './MobileApkSection';
import { apkDetails, apkDisplayName, apkValidationErrors } from './mobile-apk';

let root: Root | undefined;
let container: HTMLDivElement | undefined;

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  root = undefined;
  container = undefined;
  vi.unstubAllGlobals();
});

function Harness({ initial, isEdit = false, errors = {} }: { initial: MobileApkValue; isEdit?: boolean; errors?: Record<string, string> }) {
  const [value, setValue] = useState(initial);
  return (
    <>
      <MobileApkSection value={value} onChange={(p) => setValue((v) => ({ ...v, ...p }))} errors={errors} isEdit={isEdit} />
      <output data-testid="value">{JSON.stringify(value)}</output>
    </>
  );
}

function render(ui: React.ReactNode) {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => root?.render(ui));
}

const empty: MobileApkValue = { apkPath: '', packageName: '', mainActivity: '', framework: '' };
const current = () => JSON.parse(container!.querySelector('[data-testid="value"]')!.textContent!);
const sectionText = () => container!.textContent!.replace(container!.querySelector('[data-testid="value"]')!.textContent!, '');

async function upload(file: File) {
  const input = container!.querySelector<HTMLInputElement>('input[type="file"]')!;
  Object.defineProperty(input, 'files', { value: [file], configurable: true });
  await act(async () => { input.dispatchEvent(new Event('change', { bubbles: true })); });
}

describe('MobileApkSection', () => {
  it('subir el APK rellena package y actividad sin pedir emulador ni Appium', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      apkPath: 'C:\\srv\\.artifacts\\apks\\0f8e2a1c-1b2c-4d5e-8f90-abcdefabcdef-banca.apk',
      packageName: 'com.banco.app', mainActivity: 'com.banco.app.MainActivity',
      versionName: '3.2.0', versionCode: '42', minSdk: '26', inspectionSource: 'manifest',
    }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    render(<Harness initial={empty} />);

    expect(container!.textContent).toContain('Selecciona o arrastra el APK');
    expect(container!.textContent).toContain('No necesitas configurar emulador ni Appium');
    expect(container!.textContent).not.toMatch(/AVD|puerto/i);

    await upload(new File(['apk'], 'banca.apk'));

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toMatch(/\/api\/projects\/inspect-apk$/);
    expect(init.body).toBeInstanceOf(FormData);
    expect(current()).toMatchObject({ packageName: 'com.banco.app', mainActivity: 'com.banco.app.MainActivity' });
    expect(current().apkPath).toMatch(/banca\.apk$/);
    expect(container!.textContent).toContain('banca.apk');
    expect(container!.textContent).toContain('Versión 3.2.0 (build 42)');
    expect(container!.textContent).toContain('Requiere Android 8.0 (API 26) o superior');
  });

  it('si el APK no declara actividad principal abre las opciones avanzadas para completarla', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ apkPath: '/tmp/x.apk', packageName: 'com.x', mainActivity: '' }), { status: 200 })));
    render(<Harness initial={empty} />);
    await upload(new File(['apk'], 'x.apk'));
    expect(container!.querySelector('input[placeholder="com.example.app.MainActivity"]')).not.toBeNull();
  });

  it('un archivo que no es .apk no se sube', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    render(<Harness initial={empty} />);
    await upload(new File(['x'], 'notas.txt'));
    expect(fetchMock).not.toHaveBeenCalled();
    expect(container!.textContent).toContain('El archivo debe ser .apk');
  });

  it('al editar muestra el APK actual por su nombre y permite reemplazarlo', () => {
    render(<Harness isEdit initial={{ apkPath: 'C:\\srv\\apks\\fenix\\0f8e2a1c-1b2c-4d5e-8f90-abcdefabcdef-fenix.apk', packageName: 'com.fenix', mainActivity: 'com.fenix.Main', framework: '' }} />);
    expect(container!.textContent).toContain('fenix.apk');
    expect(sectionText()).not.toContain('0f8e2a1c');
    expect(container!.textContent).toContain('Reemplazar');
  });
});

describe('mobile-apk', () => {
  it('apkDisplayName quita la carpeta y el prefijo de la subida', () => {
    expect(apkDisplayName('/data/.artifacts/apks/0f8e2a1c-1b2c-4d5e-8f90-abcdefabcdef-app.apk')).toBe('app.apk');
    expect(apkDisplayName('D:\\apks\\mi-app.apk')).toBe('mi-app.apk');
  });

  it('apkDetails omite lo que el APK no declara', () => {
    expect(apkDetails({})).toEqual([]);
    expect(apkDetails({ versionName: '1.0', minSdk: '99' })).toEqual(['Versión 1.0', 'Requiere API 99 o superior']);
  });

  it('apkValidationErrors pide el APK primero y luego lo que no se detectó', () => {
    expect(apkValidationErrors('', '', '')).toEqual({ apkPath: 'Sube el APK de la app' });
    expect(Object.keys(apkValidationErrors('/a.apk', '', ''))).toEqual(['packageName', 'mainActivity']);
    expect(apkValidationErrors('/a.apk', 'com.a', 'com.a.Main')).toEqual({});
  });
});
