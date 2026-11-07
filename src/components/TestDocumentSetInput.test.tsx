import React, { act, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { TestDocumentSetInput, documentSetComplete } from './TestDocumentSetInput';

vi.mock('./TestFileAssetInput', () => ({
  TestFileAssetInput: ({ onChange }: { onChange: (fileRef: string) => void }) =>
    <button type="button" data-fixture-choice onClick={() => onChange('a68b0fb1-201b-4d63-a343-b92adee67662')}>Elegir fixture</button>,
}));

let root: ReturnType<typeof createRoot> | undefined;
let container: HTMLDivElement | undefined;

afterEach(() => {
  if (root) act(() => root?.unmount());
  container?.remove(); root = undefined; container = undefined; vi.restoreAllMocks(); vi.unstubAllGlobals();
});

it('maps multiple exact document labels to project fixture refs', async () => {
  let ids = 0;
  vi.stubGlobal('crypto', { randomUUID: () => `row-${++ids}` });
  container = document.createElement('div'); document.body.append(container); root = createRoot(container);
  function Harness() {
    const [value, setValue] = useState('');
    return <><TestDocumentSetInput projectSlug="fixture-project" area="runs" value={value} onChange={setValue} />
      <output data-runtime-value>{value}</output></>;
  }
  await act(async () => root?.render(<Harness />));
  const add = () => [...(container?.querySelectorAll('button') ?? [])].find(button => button.textContent?.includes('Agregar documento')) as HTMLButtonElement;
  await act(async () => add().click());
  await act(async () => add().click());
  const labels = [...container.querySelectorAll<HTMLInputElement>('input[placeholder="Etiqueta exacta del documento"]')];
  expect(labels).toHaveLength(2);
  for (const [index, label] of labels.entries()) await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(label, `Documento ${index + 1}`);
    label.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await act(async () => container!.querySelectorAll<HTMLButtonElement>('[data-fixture-choice]')[1]!.click());
  const serialized = container.querySelector('output')?.textContent ?? '';
  expect(JSON.parse(serialized)).toEqual({
    'Documento 1': '',
    'Documento 2': 'a68b0fb1-201b-4d63-a343-b92adee67662',
  });
  expect(documentSetComplete(serialized)).toBe(false);
  expect(documentSetComplete(JSON.stringify({ 'Documento 1': 'a68b0fb1-201b-4d63-a343-b92adee67662' }))).toBe(true);
});

it('rejects more than twenty selected document fixtures', () => {
  const refs = Object.fromEntries(Array.from({ length: 21 }, (_, index) => [`Documento ${index + 1}`, 'a68b0fb1-201b-4d63-a343-b92adee67662']));
  expect(documentSetComplete(JSON.stringify(refs))).toBe(false);
});

it('keeps one captured file component full width and only splits multiple documents', async () => {
  const fileRef = 'a68b0fb1-201b-4d63-a343-b92adee67662';
  container = document.createElement('div'); document.body.append(container); root = createRoot(container);

  await act(async () => root?.render(
    <TestDocumentSetInput
      variant="light"
      projectSlug="fixture-project"
      area="runs"
      value={JSON.stringify({ Documento: fileRef })}
      onChange={() => undefined}
    />,
  ));
  const documentGrid = container.querySelector('div.grid.grid-cols-1.gap-3');
  expect(documentGrid).toBeTruthy();
  expect(documentGrid?.className).not.toContain('sm:grid-cols-2');

  await act(async () => root?.render(
    <TestDocumentSetInput
      variant="light"
      projectSlug="fixture-project"
      area="runs"
      value={JSON.stringify({ Documento: fileRef, Documento2: fileRef })}
      onChange={() => undefined}
    />,
  ));
  expect(container.querySelector('div.grid.grid-cols-1.gap-3.sm\\:grid-cols-2')).toBeTruthy();
});
