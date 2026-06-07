import { describe, it, expect, vi } from 'vitest';
import {
  migrateAppConfigForTestRailProject,
  learnEntrySteps,
  createRouteProfile,
  applyEntryStepsToScenarios,
  makeAppProfileCreatedButRouteProfileMissingError,
  normalizeAppSlug,
  validateAppSlug,
  fixMojibake,
  hasSufficientEvidence,
  shouldMigrateAppConfig,
  resolveTestRailProjectName,
} from './app-config-service';
import type { SnapshotEvidence, ScenarioTarget } from './app-config-service';

/* ─────────────── normalizeAppSlug ─────────────── */

describe('normalizeAppSlug', () => {
  it('normaliza nombre español a slug', () => {
    expect(normalizeAppSlug('Arquitectura automatización')).toBe('arquitectura-automatizacion');
  });

  it('normaliza con mayúsculas', () => {
    expect(normalizeAppSlug('Mi App de Pruebas')).toBe('mi-app-de-pruebas');
  });

  it('elimina caracteres especiales', () => {
    expect(normalizeAppSlug('App#1 (beta)')).toBe('app1-beta');
  });

  it('colapsa múltiples guiones', () => {
    expect(normalizeAppSlug('a   b')).toBe('a-b');
  });

  it('elimina guiones al inicio/fin', () => {
    expect(normalizeAppSlug('-hola-')).toBe('hola');
  });

  it('retorna vacío para string vacío', () => {
    expect(normalizeAppSlug('')).toBe('');
  });
});

/* ─────────────── validateAppSlug ─────────────── */

describe('validateAppSlug', () => {
  it('rechaza path traversal con ..', () => {
    expect(validateAppSlug('../malicious')).toBe(false);
  });

  it('rechaza path traversal con /', () => {
    expect(validateAppSlug('subdir/archivo')).toBe(false);
  });

  it('rechaza path traversal con \\', () => {
    expect(validateAppSlug('subdir\\archivo')).toBe(false);
  });

  it('rechaza slugs técnicos', () => {
    expect(validateAppSlug('tests')).toBe(false);
    expect(validateAppSlug('default')).toBe(false);
    expect(validateAppSlug('unknown')).toBe(false);
  });

  it('acepta slugs válidos', () => {
    expect(validateAppSlug('mi-app')).toBe(true);
    expect(validateAppSlug('arquitectura-automatizacion')).toBe(true);
  });

  it('rechaza null/undefined', () => {
    expect(validateAppSlug(null as any)).toBe(false);
    expect(validateAppSlug(undefined as any)).toBe(false);
  });
});

/* ─────────────── fixMojibake ─────────────── */

describe('fixMojibake', () => {
  it('corrige mojibake común', () => {
    expect(fixMojibake('automatizaciÃ³n')).toBe('automatización');
  });

  it('no modifica texto correcto', () => {
    const ok = 'Arquitectura automatización';
    expect(fixMojibake(ok)).toBe(ok);
  });
});

/* ─────────────── resolveTestRailProjectName ─────────────── */

describe('resolveTestRailProjectName', () => {
  it('usa nombre explícito si está disponible', async () => {
    const name = await resolveTestRailProjectName(56, 'Arquitectura automatización');
    expect(name).toBe('Arquitectura automatización');
  });

  it('consulta TestRail API si no hay nombre explícito', async () => {
    const mockClient = {
      getProjects: vi.fn().mockResolvedValue({
        projects: [
          { id: 12, name: 'Otro proyecto' },
          { id: 56, name: 'Arquitectura automatización' },
        ],
      }),
    };
    const name = await resolveTestRailProjectName(56, null, mockClient);
    expect(name).toBe('Arquitectura automatización');
    expect(mockClient.getProjects).toHaveBeenCalled();
  });

  it('retorna null si TestRail falla y no hay nombre explícito', async () => {
    const mockClient = {
      getProjects: vi.fn().mockRejectedValue(new Error('API error')),
    };
    const name = await resolveTestRailProjectName(56, null, mockClient);
    expect(name).toBeNull();
  });

  it('retorna null sin TestRail client y sin nombre explícito', async () => {
    const name = await resolveTestRailProjectName(56);
    expect(name).toBeNull();
  });
});

/* ─────────────── migrateAppConfigForTestRailProject ─────────────── */

describe('migrateAppConfigForTestRailProject', () => {
  const metadata = { testRailProjectName: 'Arquitectura automatización', testRailProjectId: 56 };

  it('migra source default a testrail_project', () => {
    const config = { appProfile: { name: 'old-name', source: 'default' } };
    const result = migrateAppConfigForTestRailProject(config, metadata);
    expect(result.config.appProfile?.source).toBe('testrail_project');
  });

  it('corrige name con projectName real', () => {
    const config = { appProfile: { name: 'Arquitectura automatizaciÃ³n', source: 'default' } };
    const result = migrateAppConfigForTestRailProject(config, metadata);
    expect(result.config.appProfile?.name).toBe('Arquitectura automatización');
  });

  it('preserva usernameRef, passwordRef, baseUrl', () => {
    const config = {
      appProfile: {
        name: 'old',
        source: 'default',
        baseUrl: 'https://app.example.com',
        usernameRef: 'env:TEST_USER',
        passwordRef: 'vault:qa/pass',
      },
    };
    const result = migrateAppConfigForTestRailProject(config, metadata);
    const p = result.config.appProfile!;
    expect(p.baseUrl).toBe('https://app.example.com');
    expect(p.usernameRef).toBe('env:TEST_USER');
    expect(p.passwordRef).toBe('vault:qa/pass');
  });

  it('no borra campos existentes', () => {
    const config = {
      appProfile: { name: 'old', source: 'default', loginMode: 'credentials' },
      routeProfile: { name: 'old_profile', entry: ['login'] },
      someExtraField: 'preserve-me',
    };
    const result = migrateAppConfigForTestRailProject(config, metadata);
    expect(result.config.appProfile?.loginMode).toBe('credentials');
    expect(result.config.someExtraField).toBe('preserve-me');
  });

  it('idempotente: segunda llamada no cambia', () => {
    const config = { appProfile: { name: 'old', source: 'default', baseUrl: 'https://x.com' } };
    const first = migrateAppConfigForTestRailProject(config, metadata);
    const second = migrateAppConfigForTestRailProject(first.config as any, metadata);
    expect(second.config).toEqual(first.config);
  });

  it('agrega testRailProjectId', () => {
    const config = { appProfile: { source: 'default' } };
    const result = migrateAppConfigForTestRailProject(config, metadata);
    expect(result.config.appProfile?.testRailProjectId).toBe(56);
  });

  it('agrega testRailProjectName', () => {
    const config = { appProfile: { source: 'default' } };
    const result = migrateAppConfigForTestRailProject(config, metadata);
    expect(result.config.appProfile?.testRailProjectName).toBe('Arquitectura automatización');
  });

  it('inicializa routeProfile como null si falta', () => {
    const config = { appProfile: { source: 'default' } };
    const result = migrateAppConfigForTestRailProject(config, metadata);
    expect(result.config.routeProfile).toBeNull();
  });

  it('no sobreescribe routeProfile existente', () => {
    const existingRouteProfile = { name: 'existing', entry: ['login'] };
    const config = { appProfile: { source: 'default' }, routeProfile: existingRouteProfile };
    const result = migrateAppConfigForTestRailProject(config, metadata);
    expect(result.config.routeProfile).toEqual(existingRouteProfile);
  });

  it('no modifica appProfile para otros appSlug (prueba de aislamiento)', () => {
    const configA = {
      appProfile: { name: 'App A', source: 'default', usernameRef: 'env:A_USER' },
    };
    const configB = {
      appProfile: { name: 'App B', source: 'default', usernameRef: 'env:B_USER' },
    };
    const resultA = migrateAppConfigForTestRailProject(configA, { testRailProjectName: 'App A', testRailProjectId: 1 });
    const resultB = migrateAppConfigForTestRailProject(configB, { testRailProjectName: 'App B', testRailProjectId: 2 });
    expect(resultA.config.appProfile?.name).toBe('App A');
    expect(resultB.config.appProfile?.name).toBe('App B');
    expect(resultA.config.appProfile?.testRailProjectId).toBe(1);
    expect(resultB.config.appProfile?.testRailProjectId).toBe(2);
  });
});

/* ─────────────── learnEntrySteps ─────────────── */

describe('learnEntrySteps', () => {
  const iniciarSnapshot: SnapshotEvidence = {
    visibleControls: [
      { label: 'Iniciar', type: 'button', visible: true },
      { label: 'Logo', type: 'image', visible: true },
    ],
  };

  const emptySnapshot: SnapshotEvidence = { visibleControls: [] };

  const targetInformacion: ScenarioTarget[] = [
    { action: 'click', target: 'Información de productos', stepText: 'Clic en Información de productos' },
  ];

  const targetIniciar: ScenarioTarget[] = [
    { action: 'click', target: 'Iniciar', stepText: 'Clic en Iniciar' },
  ];

  it('aprende entryStep para proyecto A con botón Iniciar visible si target no está visible', () => {
    const result = learnEntrySteps(iniciarSnapshot, targetInformacion);
    expect(result.entrySteps).toHaveLength(1);
    expect(result.entrySteps[0]).toMatchObject({
      action: 'click',
      target: 'Iniciar',
      when: 'before_first_functional_step',
    });
    expect(result.confidence).toBe('full');
  });

  it('proyecto B sin botón Iniciar no aprende entryStep', () => {
    const snapshotSinIniciar: SnapshotEvidence = {
      visibleControls: [
        { label: 'Bienvenido', type: 'text', visible: true },
        { label: 'Menú principal', type: 'menu', visible: true },
      ],
    };
    const result = learnEntrySteps(snapshotSinIniciar, targetInformacion);
    expect(result.entrySteps).toHaveLength(0);
    expect(result.confidence).toBe('none');
  });

  it('no aprende entryStep si primer target ya está visible', () => {
    const snapshotConTarget: SnapshotEvidence = {
      visibleControls: [
        { label: 'Información de productos', type: 'button', visible: true },
      ],
    };
    const result = learnEntrySteps(snapshotConTarget, targetInformacion);
    expect(result.entrySteps).toHaveLength(0);
    expect(result.confidence).toBe('full');
  });

  it('no inventa entryStep si no hay snapshot', () => {
    const result = learnEntrySteps(null, targetInformacion);
    expect(result.entrySteps).toHaveLength(0);
    expect(result.confidence).toBe('none');
  });

  it('no inventa entryStep si no hay evidencia', () => {
    const result = learnEntrySteps(emptySnapshot, []);
    expect(result.entrySteps).toHaveLength(0);
    expect(result.confidence).toBe('none');
  });

  it('no inventa entryStep si no hay targets', () => {
    const result = learnEntrySteps(iniciarSnapshot, []);
    expect(result.entrySteps).toHaveLength(0);
    expect(result.confidence).toBe('none');
  });

  it('no aprende entryStep si el target del primer paso ya es visible a pesar de que Iniciar también lo es', () => {
    const snapshot: SnapshotEvidence = {
      visibleControls: [
        { label: 'Iniciar', type: 'button', visible: true },
        { label: 'Información de productos', type: 'menuitem', visible: true },
      ],
    };
    const result = learnEntrySteps(snapshot, targetInformacion);
    expect(result.entrySteps).toHaveLength(0);
    expect(result.confidence).toBe('full');
  });

  it('proyecto A no modifica proyecto B — verificación de aislamiento', () => {
    const projectA = learnEntrySteps(iniciarSnapshot, targetInformacion);
    const projectB = learnEntrySteps(null, targetInformacion);
    expect(projectA.entrySteps).toHaveLength(1);
    expect(projectB.entrySteps).toHaveLength(0);
  });
});

/* ─────────────── createRouteProfile ─────────────── */

describe('createRouteProfile', () => {
  it('crea routeProfile con entrySteps y domainTerms', () => {
    const entrySteps = [{ action: 'click', target: 'Iniciar', when: 'before_first_functional_step', reason: 'test' }];
    const targets: ScenarioTarget[] = [
      { action: 'click', target: 'Información de productos', stepText: 'Clic en Información de productos' },
      { action: 'click', target: 'Productos', stepText: 'Clic en Productos' },
    ];
    const profile = createRouteProfile('arquitectura-automatizacion', entrySteps, targets);
    expect(profile.name).toBe('testrail_arquitectura-automatizacion');
    expect(profile.entrySteps).toHaveLength(1);
    expect(profile.entry).toContain('Información de productos');
    expect(profile.entry).toContain('Productos');
    expect(profile.domainTerms?.['informacion-de-productos']).toBe('Clic en Información de productos');
    expect(profile.visibleControls).toContain('Información de productos');
  });

  it('crea perfil sin entrySteps si no hay evidencia', () => {
    const targets: ScenarioTarget[] = [{ action: 'click', target: 'Login', stepText: 'Login' }];
    const profile = createRouteProfile('mi-app', [], targets);
    expect(profile.entrySteps).toBeUndefined();
    expect(profile.entry).toContain('Login');
  });
});

/* ─────────────── hasSufficientEvidence ─────────────── */

describe('hasSufficientEvidence', () => {
  it('retorna true si hay targets con target y action', () => {
    expect(hasSufficientEvidence([], [{ action: 'click', target: 'Login' }])).toBe(true);
  });

  it('retorna true si hay entrySteps', () => {
    expect(hasSufficientEvidence([{ action: 'click', target: 'Iniciar', when: 'before' }], [])).toBe(true);
  });

  it('retorna false si no hay nada', () => {
    expect(hasSufficientEvidence([], [])).toBe(false);
  });
});

/* ─────────────── applyEntryStepsToScenarios ─────────────── */

describe('applyEntryStepsToScenarios', () => {
  const entrySteps = [{ action: 'click', target: 'Iniciar', when: 'before_first_functional_step' }];
  const scenarios = [
    { steps: ['Clic en Información de productos', 'Validar página'], title: 'Test 1' },
  ];

  it('inserta entrySteps antes del primer paso funcional', () => {
    const result = applyEntryStepsToScenarios(scenarios, entrySteps);
    expect(result[0].steps[0]).toBe('Clic en "Iniciar"');
    expect(result[0].steps[1]).toBe('Clic en Información de productos');
  });

  it('no duplica entrySteps si ya fueron aplicados', () => {
    const alreadyApplied = [
      { steps: ['Clic en "Iniciar"', 'Clic en Información de productos'], title: 'Test 2' },
    ];
    const result = applyEntryStepsToScenarios(alreadyApplied, entrySteps);
    expect(result[0].steps).toHaveLength(2);
    expect(result[0].steps[0]).toBe('Clic en "Iniciar"');
  });

  it('no modifica escenarios si no hay entrySteps', () => {
    const result = applyEntryStepsToScenarios(scenarios, null);
    expect(result[0].steps).toEqual(scenarios[0].steps);
  });

  it('no modifica escenarios si entrySteps es array vacío', () => {
    const result = applyEntryStepsToScenarios(scenarios, []);
    expect(result[0].steps).toEqual(scenarios[0].steps);
  });
});

/* ─────────────── Error helper ─────────────── */

describe('makeAppProfileCreatedButRouteProfileMissingError', () => {
  it('genera error accionable con hint', () => {
    const err = makeAppProfileCreatedButRouteProfileMissingError('arquitectura-automatizacion', 'Arquitectura automatización');
    expect(err.errorCode).toBe('app_profile_created_but_route_profile_missing');
    expect(err.appSlug).toBe('arquitectura-automatizacion');
    expect(err.appConfigPath).toBe('automations/apps/arquitectura-automatizacion/app.config.json');
    expect(err.hint).toContain('Abra la app');
    expect(err.expectedRouteProfileShape).toContain('entrySteps');
  });
});

/* ─────────────── shouldMigrateAppConfig ─────────────── */

describe('shouldMigrateAppConfig', () => {
  it('retorna true para appSlug válido', () => {
    expect(shouldMigrateAppConfig('arquitectura-automatizacion')).toBe(true);
  });

  it('retorna false para null/undefined', () => {
    expect(shouldMigrateAppConfig(null)).toBe(false);
    expect(shouldMigrateAppConfig(undefined)).toBe(false);
  });

  it('retorna false para slugs técnicos', () => {
    expect(shouldMigrateAppConfig('tests')).toBe(false);
    expect(shouldMigrateAppConfig('unknown')).toBe(false);
  });

  it('retorna false para path traversal', () => {
    expect(shouldMigrateAppConfig('../malicious')).toBe(false);
  });
});

/* ─────────────── Integration: flujo completo ─────────────── */

describe('flujo completo: migration + learning + apply', () => {
  const metadata = { testRailProjectName: 'Arquitectura automatización', testRailProjectId: 56 };
  const snapshot: SnapshotEvidence = {
    visibleControls: [
      { label: 'Iniciar', type: 'button', visible: true },
      { label: 'Logo', type: 'image', visible: true },
    ],
  };
  const targets: ScenarioTarget[] = [
    { action: 'click', target: 'Información de productos', stepText: 'Clic en Información de productos' },
    { action: 'click', target: 'Productos', stepText: 'Clic en Productos' },
  ];

  it('migra config + aprende entrySteps + crea routeProfile + aplica a escenarios', () => {
    // 1. Migrar config
    const appSlug = normalizeAppSlug(metadata.testRailProjectName);
    expect(appSlug).toBe('arquitectura-automatizacion');

    const oldConfig = {
      appProfile: { name: 'Arquitectura automatizaciÃ³n', source: 'default', baseUrl: 'https://app.example.com' },
    };
    const migration = migrateAppConfigForTestRailProject(oldConfig, metadata);
    expect(migration.config.appProfile?.source).toBe('testrail_project');
    expect(migration.config.appProfile?.name).toBe('Arquitectura automatización');
    expect(migration.config.appProfile?.baseUrl).toBe('https://app.example.com');
    expect(migration.config.appProfile?.testRailProjectId).toBe(56);
    expect(migration.config.appProfile?.testRailProjectName).toBe('Arquitectura automatización');
    expect(migration.config.routeProfile).toBeNull();

    // 2. Aprender entrySteps
    const learning = learnEntrySteps(snapshot, targets);
    expect(learning.entrySteps).toHaveLength(1);
    expect(learning.confidence).toBe('full');

    // 3. Crear routeProfile
    const profile = createRouteProfile(appSlug, learning.entrySteps, targets);
    expect(profile.name).toBe('testrail_arquitectura-automatizacion');
    expect(profile.entrySteps).toHaveLength(1);

    // 4. Aplicar a escenarios
    const scenarios = [
      { steps: ['Clic en Información de productos', 'Validar página'], title: 'Test' },
    ];
    const applied = applyEntryStepsToScenarios(scenarios, profile.entrySteps);
    expect(applied[0].steps[0]).toBe('Clic en "Iniciar"');
    expect(applied[0].steps[1]).toBe('Clic en Información de productos');

    // 5. No duplicar si se aplica otra vez
    const reapplied = applyEntryStepsToScenarios(applied, profile.entrySteps);
    expect(reapplied[0].steps).toHaveLength(3); // same as applied (no change expected from original + entry)

    // 6. Otra app sin evidencia no recibe entrySteps
    const otherTargets: ScenarioTarget[] = [{ action: 'click', target: 'Login', stepText: 'Login' }];
    const otherLearning = learnEntrySteps(null, otherTargets);
    expect(otherLearning.entrySteps).toHaveLength(0);

    const otherProfile = createRouteProfile('otra-app', otherLearning.entrySteps, otherTargets);
    expect(otherProfile.entrySteps).toBeUndefined();

    const otherScenarios = [{ steps: ['Clic en Login'], title: 'Other' }];
    const otherApplied = applyEntryStepsToScenarios(otherScenarios, otherProfile.entrySteps);
    expect(otherApplied[0].steps).toEqual(['Clic en Login']);
  });
});
