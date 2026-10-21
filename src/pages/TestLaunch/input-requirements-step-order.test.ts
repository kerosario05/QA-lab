import { describe, expect, it } from 'vitest';
import { groupRuntimeInputRequirements, orderRuntimeInputsByStepOrder } from './input-requirements';

const requirement = (key: string, label: string) => ({ key, label, controlType: 'text', required: true });

describe('orderRuntimeInputsByStepOrder', () => {
  const steps = [
    'Abrir la aplicación configurada del proyecto.',
    'Presionar "perfil empresarial".',
    'Ingresar RNC en "RNC".',
    'Ingresar usuario en "Usuario".',
    'Ingresar contraseña en "Contraseña".',
    'Ingresar token de transferencia en "Token transferencia".',
  ];

  it('lists inputs in the order the steps use them, not the order they arrived in', () => {
    const grouped = groupRuntimeInputRequirements([
      requirement('contrasena', 'Contrasena'),
      requirement('rnc', 'Rnc'),
      requirement('token_transferencia', 'Token transferencia'),
      requirement('usuario', 'Usuario'),
    ] as never);
    const ordered = orderRuntimeInputsByStepOrder(grouped, steps);
    expect(ordered.general.map((item) => item.inputKey)).toEqual(['rnc', 'usuario', 'contrasena', 'token_transferencia']);
  });

  it('keeps unmentioned inputs after the mentioned ones, in their original order', () => {
    const grouped = groupRuntimeInputRequirements([
      requirement('zeta', 'Zeta'),
      requirement('usuario', 'Usuario'),
      requirement('alfa', 'Alfa'),
      requirement('rnc', 'Rnc'),
    ] as never);
    expect(orderRuntimeInputsByStepOrder(grouped, steps).general.map((item) => item.inputKey)).toEqual(['rnc', 'usuario', 'zeta', 'alfa']);
  });

  it('orders dataset groups by their first mentioned step and is a no-op without steps', () => {
    const grouped = groupRuntimeInputRequirements([
      requirement('cuenta.9.destino', 'Cuenta Destino'),
      requirement('cuenta.9.origen', 'Cuenta Origen'),
      requirement('cuenta.10.destino', 'Cuenta Destino'),
      requirement('cuenta.10.origen', 'Cuenta Origen'),
    ] as never);
    expect(orderRuntimeInputsByStepOrder(grouped, undefined)).toBe(grouped);
    const accountSteps = ['Seleccionar cuenta origen.', 'Seleccionar cuenta destino.'];
    const ordered = orderRuntimeInputsByStepOrder(grouped, accountSteps);
    for (const group of ordered.groups) {
      expect(group.requirements.map((item) => item.displayLabel)).toEqual(['Cuenta Origen', 'Cuenta Destino']);
    }
  });
});
