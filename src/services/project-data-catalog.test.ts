import { afterEach, describe, expect, it, vi } from 'vitest';
import { deriveProjectDataCatalogAliases, formatProjectDataCatalogOptions, matchProjectDataCatalogs, normalizeCatalogField, parseProjectDataCatalogOptions, projectDataCatalogApi, type ProjectDataCatalog } from './project-data-catalog';

afterEach(() => vi.restoreAllMocks());

const catalog: ProjectDataCatalog = {
  id: 'catalog-1', projectSlug: 'fenix', name: 'Cuentas origen', fieldName: 'Cuenta de origen', aliases: ['cuenta_origen'], active: true, revision: 1,
  options: [{ id: 'option-1', label: 'Cuenta A', value: '001', active: true, position: 0 }],
};

describe('project data catalog field matching', () => {
  it('matches accents and separator variants exactly', () => {
    expect(normalizeCatalogField('CUENTA_de-ORIGEN')).toBe('cuenta de origen');
    expect(matchProjectDataCatalogs('Cuenta_de origen', [catalog])).toEqual([catalog]);
  });
  it('does not fuzzy-match and ignores inactive catalogs', () => {
    expect(matchProjectDataCatalogs('Cuenta', [catalog])).toEqual([]);
    expect(matchProjectDataCatalogs('Cuenta de origen', [{ ...catalog, active: false }])).toEqual([]);
  });
  it('derives a safe Spanish article-free field alias automatically', () => {
    expect(deriveProjectDataCatalogAliases('Cuenta de Origen')).toEqual(['cuenta origen']);
    expect(deriveProjectDataCatalogAliases('Cuenta_origen')).toEqual([]);
  });
  it('uses a plain option line as both label and value, with extended syntax optional', () => {
    expect(parseProjectDataCatalogOptions('Cuenta Corriente\nCuenta de ahorros')).toEqual([
      { id: undefined, label: 'Cuenta Corriente', value: 'Cuenta Corriente', active: true, position: 0 },
      { id: undefined, label: 'Cuenta de ahorros', value: 'Cuenta de ahorros', active: true, position: 1 },
    ]);
    expect(parseProjectDataCatalogOptions('Cuenta corriente | 000123 | inactivo')[0]).toMatchObject({ label: 'Cuenta corriente', value: '000123', active: false });
    expect(formatProjectDataCatalogOptions([{ id: 'one', label: 'Cuenta Corriente', value: 'Cuenta Corriente', active: true, position: 0 }])).toBe('Cuenta Corriente');
  });

  it('deduplicates concurrent catalog loads for the same project and view', async () => {
    const fetch = vi.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: true, json: async () => ({ catalogs: [catalog] }) } as Response);
    const slug = `catalog-cache-${Date.now()}`;
    const [first, second] = await Promise.all([projectDataCatalogApi.list(slug), projectDataCatalogApi.list(slug)]);
    expect(first).toEqual([catalog]);
    expect(second).toEqual([catalog]);
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
