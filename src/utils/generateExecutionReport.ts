import jsPDF from 'jspdf';

export interface ReportData {
  jobId: string;
  project: string;
  collectionName?: string;
  runType?: 'web' | 'api';
  triggered: string;
  startedAt: string;
  status: string;
  total: number;
  completed: number;
  passed: number;
  failed: number;
  elapsed: number;
  logs: Array<{ time: string; type: string; msg: string }>;
}

const HEX = {
  dark:    '#1a1f2e',
  green:   '#48A157',
  greenL:  '#5EC470',
  red:     '#E63946',
  orange:  '#E47E2B',
  blue:    '#104B99',
  mute:    '#8B999D',
  border:  '#E8EBEC',
  bg:      '#FAFAF7',
  white:   '#FFFFFF',
};

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.replace('#', ''), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function setFill(doc: jsPDF, hex: string) {
  doc.setFillColor(...hexToRgb(hex));
}

function setColor(doc: jsPDF, hex: string) {
  doc.setTextColor(...hexToRgb(hex));
}

function setDraw(doc: jsPDF, hex: string) {
  doc.setDrawColor(...hexToRgb(hex));
}

function formatTime(s: number): string {
  const m   = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}m ${sec.toString().padStart(2, '0')}s`;
}

function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleString('es-DO', {
      day: '2-digit', month: 'long', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

export function generateExecutionReport(data: ReportData): void {
  const doc  = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const W    = 210;
  const pad  = 16;
  let   y    = 0;

  const passRate   = (data.passed + data.failed) > 0 ? Math.round((data.passed / (data.passed + data.failed)) * 100) : 0;
  const isDone     = data.status === 'completed' || data.status === 'done';
  const isFailed   = data.status === 'failed' || data.status === 'error';
  const statusColor = isFailed ? HEX.red : isDone ? HEX.green : HEX.blue;
  const statusLabel = isFailed ? 'FALLIDA' : isDone ? 'COMPLETADA' : 'EN CURSO';

  // ── HEADER ───────────────────────────────────────────────────
  setFill(doc, HEX.dark);
  doc.rect(0, 0, W, 44, 'F');

  // Accent line
  setFill(doc, data.runType === 'api' ? HEX.orange : HEX.green);
  doc.rect(0, 0, 4, 44, 'F');

  // Title
  setColor(doc, HEX.white);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text('REPORTE EJECUTIVO DE EJECUCIÓN', pad + 4, 14);

  // Subtitle
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  setColor(doc, '#9BA8B0');
  doc.text('QA Lab · Automatización de Pruebas', pad + 4, 21);

  // Project name (right side)
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  setColor(doc, HEX.white);
  const projName = data.project || 'Proyecto';
  doc.text(projName, W - pad, 16, { align: 'right' });

  if (data.collectionName) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    setColor(doc, '#9BA8B0');
    doc.text(`Colección: ${data.collectionName}`, W - pad, 22, { align: 'right' });
  }

  // Date
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  setColor(doc, '#9BA8B0');
  doc.text(formatDate(data.startedAt), pad + 4, 36);
  doc.text(`Job: ${data.jobId}`, W - pad, 36, { align: 'right' });

  y = 52;

  // ── STATUS BADGE ─────────────────────────────────────────────
  setFill(doc, statusColor);
  doc.roundedRect(pad, y, 48, 9, 1.5, 1.5, 'F');
  setColor(doc, HEX.white);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.text(`● EJECUCIÓN ${statusLabel}`, pad + 24, y + 6, { align: 'center' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  setColor(doc, HEX.mute);
  doc.text(`Duración: ${formatTime(data.elapsed)}  ·  Disparado por: ${data.triggered}`, pad + 52, y + 6);

  y += 18;

  // ── METRIC CARDS ─────────────────────────────────────────────
  const cardW   = (W - pad * 2 - 9) / 4;
  const cards = [
    { label: 'TOTAL', value: String(data.total || data.completed), color: HEX.dark },
    { label: 'COMPLETADOS', value: String(data.completed), color: HEX.blue },
    { label: 'EXITOSOS', value: String(data.passed), color: HEX.green },
    { label: 'FALLIDOS', value: String(data.failed), color: HEX.red },
  ];

  cards.forEach((card, i) => {
    const cx = pad + i * (cardW + 3);

    // Card background
    setFill(doc, HEX.bg);
    setDraw(doc, HEX.border);
    doc.setLineWidth(0.3);
    doc.roundedRect(cx, y, cardW, 24, 2, 2, 'FD');

    // Top accent bar
    setFill(doc, card.color);
    doc.roundedRect(cx, y, cardW, 3, 2, 2, 'F');
    doc.rect(cx, y + 1, cardW, 2, 'F');

    // Value
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(20);
    setColor(doc, card.color);
    doc.text(card.value, cx + cardW / 2, y + 15, { align: 'center' });

    // Label
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    setColor(doc, HEX.mute);
    doc.text(card.label, cx + cardW / 2, y + 21, { align: 'center' });
  });

  y += 32;

  // ── PASS RATE SECTION ─────────────────────────────────────────
  const sectionH = 28;
  setFill(doc, HEX.bg);
  setDraw(doc, HEX.border);
  doc.setLineWidth(0.3);
  doc.roundedRect(pad, y, W - pad * 2, sectionH, 2, 2, 'FD');

  // Section title
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  setColor(doc, HEX.mute);
  doc.text('DISTRIBUCIÓN DE RESULTADOS', pad + 6, y + 7);

  // Pass rate label
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(22);
  setColor(doc, passRate >= 80 ? HEX.green : passRate >= 50 ? HEX.orange : HEX.red);
  doc.text(`${passRate}%`, pad + 6, y + 20);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  setColor(doc, HEX.mute);
  doc.text('pass rate', pad + 6, y + 25.5);

  // Bar track
  const barX  = pad + 36;
  const barW  = W - pad * 2 - 42;
  const barY  = y + 10;
  const barH  = 5;

  // Background bar
  setFill(doc, HEX.border);
  doc.roundedRect(barX, barY, barW, barH, 1.5, 1.5, 'F');

  // Pass fill
  if (passRate > 0) {
    setFill(doc, HEX.green);
    doc.roundedRect(barX, barY, barW * (passRate / 100), barH, 1.5, 1.5, 'F');
  }

  // Fail sub-bar
  const failRate = (data.passed + data.failed) > 0 ? Math.round((data.failed / (data.passed + data.failed)) * 100) : 0;
  const failBarY = barY + 8;
  setFill(doc, HEX.border);
  doc.roundedRect(barX, failBarY, barW, 3, 1, 1, 'F');
  if (failRate > 0) {
    setFill(doc, HEX.red);
    doc.roundedRect(barX, failBarY, barW * (failRate / 100), 3, 1, 1, 'F');
  }

  // Bar labels
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  setColor(doc, HEX.green);
  doc.text(`Exitosos: ${data.passed} (${passRate}%)`, barX, barY - 2);
  setColor(doc, HEX.red);
  doc.text(`Fallidos: ${data.failed} (${failRate}%)`, barX + barW / 2, barY - 2);

  y += sectionH + 8;

  // ── LOGS SECTION ─────────────────────────────────────────────
  const maxLogs = 28;
  const logsToShow = data.logs.slice(-maxLogs);
  const logLineH  = 4.5;
  const logsH     = Math.min(logsToShow.length * logLineH + 16, 90);

  // Background
  setFill(doc, HEX.dark);
  setDraw(doc, HEX.dark);
  doc.roundedRect(pad, y, W - pad * 2, logsH, 2, 2, 'F');

  // Header bar
  setFill(doc, '#0d1119');
  doc.roundedRect(pad, y, W - pad * 2, 8, 2, 2, 'F');
  doc.rect(pad, y + 4, W - pad * 2, 4, 'F');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  setColor(doc, HEX.greenL);
  doc.text('▸ LIVE LOGS', pad + 5, y + 5.5);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  setColor(doc, '#5a6070');
  doc.text(`${data.logs.length} eventos totales  ·  mostrando últimos ${logsToShow.length}`, W - pad - 4, y + 5.5, { align: 'right' });

  let ly = y + 12;
  logsToShow.forEach(log => {
    if (ly > y + logsH - 4) return;
    const color = log.type === 'success' ? HEX.greenL : log.type === 'error' ? '#FFB4B4' : '#9BA8B0';
    doc.setFont('courier', 'normal');
    doc.setFontSize(6.5);
    setColor(doc, '#5a6070');
    doc.text(log.time, pad + 4, ly);
    setColor(doc, color);
    const msg = log.msg.length > 90 ? log.msg.slice(0, 87) + '...' : log.msg;
    doc.text(msg, pad + 24, ly);
    ly += logLineH;
  });

  y += logsH + 8;

  // ── FOOTER ───────────────────────────────────────────────────
  const pageH = 297;
  const footerY = Math.max(y + 4, pageH - 12);

  setFill(doc, HEX.bg);
  doc.rect(0, footerY, W, 12, 'F');
  setDraw(doc, HEX.border);
  doc.setLineWidth(0.3);
  doc.line(pad, footerY, W - pad, footerY);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  setColor(doc, HEX.mute);
  doc.text('Generado por QA Lab · Sistema de Automatización de Pruebas', pad, footerY + 7);
  doc.text(new Date().toLocaleString('es-DO'), W - pad, footerY + 7, { align: 'right' });

  // ── SAVE ─────────────────────────────────────────────────────
  const filename = `reporte-${data.project.toLowerCase().replace(/\s+/g, '-')}-${data.jobId.slice(-8)}.pdf`;
  doc.save(filename);
}
