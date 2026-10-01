import type { GoalCoverage } from '../../services/recordings/types';

export type GoalCoverageMessage = {
  tone: 'warning' | 'ok' | 'acknowledged';
  headline: string;
  details: string[];
  /** What a new recording has to do to complete the goal, when the engine could name it. */
  missingSteps: string[];
};

/**
 * What the reviewer reads about the declared goal. Recording 2920301b declared "solicitar tarjeta,
 * prestamo y cuenta", only browsed, and nothing said so -- the scenarios silently documented a
 * consultation.
 */
export function goalCoverageMessage(coverage: GoalCoverage | null): GoalCoverageMessage | null {
  if (!coverage || coverage.status === 'no_goal' || !coverage.goal) return null;
  const goal = `«${coverage.goal}»`;
  if (coverage.status === 'covered') {
    return { tone: 'ok', headline: `La grabación cubre el objetivo ${goal}.`, details: [], missingSteps: [] };
  }
  if (coverage.acknowledged) {
    return {
      tone: 'acknowledged',
      headline: `Aceptado: la grabación no completa el objetivo ${goal}; los escenarios documentan lo que se hizo.`,
      details: [],
      missingSteps: [],
    };
  }
  const missingSteps: string[] = [];
  const details: string[] = [];
  for (const term of coverage.terms) {
    if (term.covered) continue;
    if (term.kind === 'action' && term.missing) {
      const step = `pulsar «${term.missing.control}»${term.missing.screen ? ` en «${term.missing.screen}»` : ''}`;
      missingSteps.push(step);
      details.push(`Falta ${step}: el control estaba en pantalla y no se usó.`);
    } else if (term.kind === 'action') {
      details.push(`No se hizo «${term.term}»: ningún control de la grabación lo ofrece.`);
    } else {
      details.push(`No se recorrió nada relacionado con «${term.term}».`);
    }
  }
  const covered = coverage.terms.filter((term) => term.covered).map((term) => term.term);
  if (covered.length > 0) details.push(`Sí se cubrió: ${covered.join(', ')}.`);
  return {
    tone: 'warning',
    headline: coverage.status === 'partial'
      ? `La grabación no completa el objetivo ${goal}.`
      : `La grabación no recorre el objetivo ${goal}.`,
    details,
    missingSteps,
  };
}
