import { useState } from 'react';
import { ChevronLeft, Lock, Bug, Check, AlertTriangle, Loader2 } from 'lucide-react';
import { C, cn } from '../../constants/theme';
import { BentoCard } from '../../components/ui/BentoCard';
import type { FailedTest } from '../../types';

interface ExecutionClosureProps {
  execution: any;
  onClose: () => void;
  onConfirm?: () => void;
}

const initialFailedTests: FailedTest[] = [
  { id: 'C1058', title: 'Transferencia entre cuentas propias', error: 'Timeout esperando confirmación (step 7)', severity: 'Crítico', reportToJira: true },
  { id: 'C1075', title: 'Consulta de saldo en cuenta corriente', error: 'Elemento .balance-amount no encontrado', severity: 'Alto', reportToJira: true },
  { id: 'C1093', title: 'Pago de tarjeta de crédito propia', error: 'Sesión expirada antes de completar', severity: 'Medio', reportToJira: false },
  { id: 'C1094', title: 'Pago programado recurrente', error: 'Validación de fecha falla en febrero', severity: 'Medio', reportToJira: true },
];

export function ExecutionClosure({ execution, onClose, onConfirm }: ExecutionClosureProps) {
  const [tests, setTests] = useState<FailedTest[]>(initialFailedTests);
  const [notes, setNotes] = useState('');
  const [isConfirming, setIsConfirming] = useState(false);

  const exec = execution || { id: 'EXE-4818', project: 'Portal Web Clientes', total: 142, passed: 132, failed: 10, duration: '13m 24s' };
  const reportingCount = tests.filter(t => t.reportToJira).length;

  const toggleReport = (id: string) => {
    setTests(t => t.map(x => x.id === id ? { ...x, reportToJira: !x.reportToJira } : x));
  };

  const handleConfirm = () => {
    setIsConfirming(true);
    setTimeout(() => onConfirm?.(), 1500);
  };

  return (
    <div className="p-7 min-h-full" style={{ background: C.canvas }}>
      <div className="max-w-5xl mx-auto">
        <button onClick={onClose} className="text-[11px] text-[#58646D] hover:text-[#104B99] flex items-center gap-1 transition mb-4">
          <ChevronLeft size={12} /> Cancelar cierre
        </button>

        <BentoCard className="!p-0 overflow-hidden mb-4">
          <div className="bg-gradient-to-br from-[#1a1f2e] via-[#0a2547] to-[#1a1f2e] text-white p-7 relative overflow-hidden">
            <div className="absolute inset-0 opacity-20" style={{ backgroundImage: `radial-gradient(circle at 80% 30%, ${C.green}40 0%, transparent 50%)` }} />
            <div className="absolute right-8 top-8 w-32 h-32 rounded-full border border-white/10" />
            <div className="relative">
              <div className="flex items-center gap-2 mb-3">
                <Lock size={13} className="text-[#5EC470]" />
                <span className="text-[10px] uppercase tracking-[0.2em] text-white/70 font-semibold">Cierre formal de ejecución</span>
              </div>
              <h2 className="text-[34px] font-medium leading-none tracking-tight" style={{ fontFamily: 'Geist, system-ui, sans-serif', letterSpacing: '-0.03em' }}>
                {exec.project}
              </h2>
              <div className="text-[12px] text-white/60 mt-2 font-mono">{exec.id} · {exec.duration}</div>
              <div className="grid grid-cols-4 gap-6 mt-6 pt-6 border-t border-white/15">
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-white/60">Total</div>
                  <div className="text-[24px] font-medium mt-1 font-mono">{exec.total}</div>
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-white/60">Exitosos</div>
                  <div className="text-[24px] font-medium mt-1 text-[#5EC470] font-mono">{exec.passed}</div>
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-white/60">Fallidos</div>
                  <div className="text-[24px] font-medium mt-1 text-[#FFB4B4] font-mono">{exec.failed}</div>
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-white/60">A reportar</div>
                  <div className="text-[24px] font-medium mt-1 font-mono">{reportingCount}/{tests.length}</div>
                </div>
              </div>
            </div>
          </div>
        </BentoCard>

        <BentoCard className="!p-5 mb-4">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2.5">
              <div className="w-7 h-7 rounded-full bg-[#E63946]/10 flex items-center justify-center">
                <Bug size={13} className="text-[#E63946]" />
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-[0.15em] text-[#8B999D] font-semibold">Revisión de fallos</div>
                <h3 className="text-[18px] font-medium text-[#1a1f2e] leading-tight" style={{ fontFamily: 'Geist, system-ui, sans-serif', letterSpacing: '-0.03em' }}>
                  Selecciona los bugs a reportar a Jira
                </h3>
              </div>
            </div>
            <button
              onClick={() => setTests(t => t.map(x => ({ ...x, reportToJira: !tests.every(y => y.reportToJira) })))}
              className="text-[11px] text-[#104B99] font-semibold hover:underline"
            >
              {tests.every(t => t.reportToJira) ? 'Desmarcar todos' : 'Marcar todos'}
            </button>
          </div>

          <div className="space-y-2">
            {tests.map(t => (
              <div
                key={t.id}
                className={cn(
                  'flex items-start gap-3 p-3 rounded-xl border transition',
                  t.reportToJira ? 'border-[#104B99]/30 bg-[#104B99]/3' : 'border-[#E8EBEC] bg-white'
                )}
              >
                <button
                  onClick={() => toggleReport(t.id)}
                  className={cn(
                    'w-4 h-4 rounded border-2 flex items-center justify-center flex-shrink-0 mt-0.5',
                    t.reportToJira ? 'border-[#104B99] bg-[#104B99]' : 'border-[#BABEC3]'
                  )}
                >
                  {t.reportToJira && <Check size={11} className="text-white" strokeWidth={3} />}
                </button>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-[10px] font-mono text-[#8B999D] font-semibold">{t.id}</span>
                    <span className={cn(
                      'inline-flex px-2 py-0.5 rounded-full text-[9px] font-semibold uppercase tracking-wider',
                      t.severity === 'Crítico' && 'bg-[#E63946]/10 text-[#E63946]',
                      t.severity === 'Alto' && 'bg-[#F4A261]/15 text-[#C97623]',
                      t.severity === 'Medio' && 'bg-[#104B99]/10 text-[#104B99]',
                    )}>{t.severity}</span>
                  </div>
                  <div className="text-[12px] font-medium text-[#1a1f2e]">{t.title}</div>
                  <div className="text-[10px] text-[#E63946] mt-1 font-mono bg-[#E63946]/5 px-2 py-1 rounded inline-block">
                    ✗ {t.error}
                  </div>
                </div>
                {t.reportToJira && (
                  <div className="text-right text-[10px] flex-shrink-0">
                    <div className="text-[#104B99] font-semibold">→ Jira</div>
                    <div className="text-[#8B999D] text-[9px]">Nuevo issue</div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </BentoCard>

        <div className="grid grid-cols-3 gap-4">
          <BentoCard className="col-span-2 !p-5">
            <div className="text-[10px] uppercase tracking-[0.15em] text-[#8B999D] font-semibold mb-2">Notas de cierre</div>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={4}
              placeholder="Observaciones del ciclo, hallazgos relevantes, recomendaciones..."
              className="w-full bg-[#FAFAF7] border border-[#E8EBEC] focus:border-[#104B99] focus:bg-white rounded-xl px-3 py-2.5 text-[12px] outline-none transition-all resize-none placeholder:text-[#BABEC3]"
            />
            <div className="text-[10px] text-[#8B999D] mt-2 flex items-center gap-1.5">
              <AlertTriangle size={11} className="text-[#F4A261]" />
              El cierre es definitivo. La ejecución quedará archivada con tu firma.
            </div>
          </BentoCard>

          <BentoCard className="!p-5 flex flex-col">
            <div className="text-[10px] uppercase tracking-[0.15em] text-[#8B999D] font-semibold mb-3">Resumen</div>
            <div className="space-y-2 flex-1">
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-[#58646D]">Bugs a Jira</span>
                <span className="font-semibold text-[#1a1f2e] font-mono">{reportingCount}</span>
              </div>
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-[#58646D]">Pass rate</span>
                <span className="font-semibold text-[#48A157] font-mono">{((exec.passed / exec.total) * 100).toFixed(1)}%</span>
              </div>
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-[#58646D]">Firmado por</span>
                <span className="font-semibold text-[#1a1f2e]">Carlos M.</span>
              </div>
            </div>
            <button
              onClick={handleConfirm}
              disabled={isConfirming}
              className="mt-4 w-full bg-gradient-to-r from-[#48A157] to-[#357a42] hover:from-[#5EC470] hover:to-[#48A157] text-white text-[12px] font-semibold py-2.5 rounded-full transition flex items-center justify-center gap-1.5 shadow-lg shadow-[#48A157]/20 disabled:opacity-60"
            >
              {isConfirming ? (
                <><Loader2 size={13} className="animate-spin" /> Cerrando...</>
              ) : (
                <><Lock size={12} /> Confirmar cierre</>
              )}
            </button>
          </BentoCard>
        </div>
      </div>
    </div>
  );
}
