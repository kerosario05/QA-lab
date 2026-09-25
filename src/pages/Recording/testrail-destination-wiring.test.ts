import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Structural regression guard for the Recording → TestRail-destination hand-off.
 *
 * Mounting the full Recording page requires driving its entire session lifecycle (project
 * list, recording start/poll, derivation) through fetch mocks — expensive to set up and
 * fragile to maintain for what is, here, a pure wiring change. These assertions instead pin
 * the exact source-level contract that TestRailUploadScreen.test.tsx then exercises at
 * runtime: the panel is gone, the button is renamed and no longer executes directly, and the
 * hand-off/back-navigation carries the real session state (never a re-derived query).
 */
const source = fs.readFileSync(path.join(__dirname, 'index.tsx'), 'utf-8');

describe('Recording page — TestRail destination hand-off wiring', () => {
  // CASE 1
  it('no longer renders the "Destino en TestRail" picker inline', () => {
    expect(source).not.toContain('<TestRailDestinationPicker');
  });

  // CASE 2
  it('renames the web action to "Reproducir y subir a TestRail"', () => {
    expect(source).toContain('Reproducir y subir a TestRail');
    expect(source).not.toContain('Reproducir y generar spec');
  });

  // CASE 3 + CASE 9: the handler hands off session state, not a re-derived query, and
  // clearing it (back navigation) never touches session/recordingId.
  it('handleReplay hands off the real selection instead of executing directly', () => {
    expect(source).not.toMatch(/handleReplay[\s\S]{0,400}replay\.replay/);
    expect(source).toMatch(/setTestRailUpload\(\{\s*scenarios:\s*executionScenarios/);
  });

  it('the destination screen receives the live recordingId and onBack only clears local state', () => {
    expect(source).toMatch(/recordingId=\{session\.recordingId\}/);
    expect(source).toMatch(/onBack=\{\(\)\s*=>\s*setTestRailUpload\(null\)\}/);
  });

  // CASE 8: no TestRail project/suite/section literal reintroduced on this page.
  it('has no hardcoded TestRail project/suite/section identity', () => {
    expect(source).not.toMatch(/Portal Empresarial/);
    expect(source).not.toMatch(/projectIdTr:\s*['"]\d+['"]/);
  });

  // Duplicate-action cleanup (CASE 1 / CASE 2 of the redesign task): Recording must expose
  // exactly one TestRail action, not two competing ones.
  it('no longer renders "Enviar a TestRail" — the web flow has a single TestRail action', () => {
    expect(source).not.toContain('Enviar a TestRail');
    expect(source).not.toContain('handlePublish');
  });

  it('the only TestRail action on this page is "Reproducir y subir a TestRail"', () => {
    const testRailActionLabels = [...source.matchAll(/>\s*(Reproducir y subir a TestRail|Enviar a TestRail)\s*</g)].map((m) => m[1]);
    expect(testRailActionLabels).toEqual(['Reproducir y subir a TestRail']);
  });
});
