import { describe, expect, it } from 'vitest';
import type { GoalCoverage } from '../../services/recordings/types';
import { goalCoverageMessage } from './goal-coverage-message';

const RECORDING_2920301B: GoalCoverage = {
  goal: 'solicitar tarjeta, prestamo y cuenta',
  status: 'partial',
  acknowledged: false,
  pressed: ['Explora nuestros productos', 'Tarjetas', 'Cuentas', 'Préstamos'],
  terms: [
    { term: 'solicitar', kind: 'action', covered: false, evidence: [], missing: { control: 'Solicitar', screen: 'Más detalles del producto' } },
    { term: 'tarjeta', kind: 'object', covered: true, evidence: ['Tarjetas'] },
    { term: 'prestamo', kind: 'object', covered: true, evidence: ['Préstamos'] },
    { term: 'cuenta', kind: 'object', covered: true, evidence: ['Cuentas'] },
  ],
};

describe('goalCoverageMessage', () => {
  it('names the control that was on screen and never pressed (recording 2920301b)', () => {
    const message = goalCoverageMessage(RECORDING_2920301B)!;
    expect(message.tone).toBe('warning');
    expect(message.headline).toBe('La grabación no completa el objetivo «solicitar tarjeta, prestamo y cuenta».');
    expect(message.missingSteps).toEqual(['pulsar «Solicitar» en «Más detalles del producto»']);
    expect(message.details).toContain('Sí se cubrió: tarjeta, prestamo, cuenta.');
  });

  it('turns quiet once the reviewer accepted it, and positive when covered', () => {
    expect(goalCoverageMessage({ ...RECORDING_2920301B, acknowledged: true })?.tone).toBe('acknowledged');
    expect(goalCoverageMessage({ ...RECORDING_2920301B, status: 'covered' })?.tone).toBe('ok');
  });

  it('explains an action no control offered and an object never walked', () => {
    const message = goalCoverageMessage({
      goal: 'transferir a terceros',
      status: 'not_reached',
      acknowledged: false,
      pressed: [],
      terms: [
        { term: 'transferir', kind: 'action', covered: false, evidence: [] },
        { term: 'terceros', kind: 'object', covered: false, evidence: [] },
      ],
    })!;
    expect(message.headline).toBe('La grabación no recorre el objetivo «transferir a terceros».');
    expect(message.details).toEqual([
      'No se hizo «transferir»: ningún control de la grabación lo ofrece.',
      'No se recorrió nada relacionado con «terceros».',
    ]);
  });

  it('shows nothing without a declared goal', () => {
    expect(goalCoverageMessage({ status: 'no_goal', terms: [], pressed: [], acknowledged: false })).toBeNull();
    expect(goalCoverageMessage(null)).toBeNull();
  });
});
