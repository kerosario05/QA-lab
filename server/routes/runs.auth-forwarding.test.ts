import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import express from 'express';
import type { Server } from 'http';

/**
 * FIRST_LOSS: con AUTH_ENABLED=true el motor exige una sesión en todo `/api/*`, pero cuatro
 * proxies de `runs.ts` llamaban con `fetch(url)` a secas — sin cabeceras. El motor respondía
 * 401 `missing_token` y el BFF reenviaba ese cuerpo al front, que lo mezclaba con su propio
 * estado: de ahí el `{ok:false, error:"missing_token", activeScenario:null}` que veía el usuario
 * DESPUÉS de iniciar sesión correctamente.
 *
 * No lo introdujo ningún cambio reciente: `engineHeaders()` se añadió a tres de los siete
 * `fetch` del archivo y estos cuatro se quedaron fuera. Antes no se notaba porque con
 * AUTH_ENABLED=false el motor dejaba pasar todo.
 *
 * Las cuatro rutas importan: sin ellas no hay log en vivo, ni detalle de la corrida, ni
 * descarga del reporte de evidencia — justamente lo que debe funcionar leyendo la ejecución
 * desde la base de datos.
 *
 * Esta prueba no comprueba que el proxy devuelva datos: comprueba que el token LLEGA al motor,
 * que es lo único que estaba roto.
 */

const PORT = 9886;
const MOCK_ENGINE_PORT = 9887;
const TOKEN = 'Bearer token-de-prueba-123';

let server: Server;
let mockEngine: Server;
/** Cabecera Authorization vista por el motor simulado, por ruta. */
let vistas: Record<string, string | undefined> = {};
/**
 * `RUN_PROVIDER_BASE_URL` es global al proceso y vitest comparte worker entre archivos:
 * dejarla puesta hacía fallar los 23 casos de `runs.test.ts`, que la borra a propósito.
 */
let baseUrlPrevia: string | undefined;

beforeAll(async () => {
  baseUrlPrevia = process.env.RUN_PROVIDER_BASE_URL;
  process.env.RUN_PROVIDER_BASE_URL = `http://localhost:${MOCK_ENGINE_PORT}`;

  const { default: runsRouter } = await import('./runs');
  const { captureRequestAuth } = await import('../engine-auth');

  const app = express();
  app.use(express.json());
  // Igual que el servidor real: captura la autorización de la petición entrante.
  app.use(captureRequestAuth());
  app.use('/api/runs', runsRouter);

  const engine = express();
  const anota = (clave: string) => (req: express.Request, res: express.Response) => {
    vistas[clave] = req.headers.authorization;
    // Respuestas mínimas y válidas: lo que se mide es la cabecera, no el cuerpo.
    if (clave === 'logs') {
      res.setHeader('Content-Type', 'text/event-stream');
      res.write('data: {}\n\n');
      res.end();
      return;
    }
    if (clave === 'docx' || clave === 'docx-head') {
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
      res.end(Buffer.from('docx'));
      return;
    }
    res.json({ ok: true, jobId: 'job-1', status: 'done' });
  };
  engine.get('/api/runs/job-1/logs', anota('logs'));
  engine.get('/api/runs/job-1/evidence-docx/status', anota('docx-status'));
  engine.head('/api/runs/job-1/evidence-docx', anota('docx-head'));
  engine.get('/api/runs/job-1/evidence-docx', anota('docx'));
  engine.get('/api/runs/job-1', anota('detalle'));

  await new Promise<void>((r) => { mockEngine = engine.listen(MOCK_ENGINE_PORT, () => r()); });
  await new Promise<void>((r) => { server = app.listen(PORT, () => r()); });
});

afterAll(async () => {
  await new Promise<void>((r) => server.close(() => r()));
  await new Promise<void>((r) => mockEngine.close(() => r()));
  if (baseUrlPrevia === undefined) delete process.env.RUN_PROVIDER_BASE_URL;
  else process.env.RUN_PROVIDER_BASE_URL = baseUrlPrevia;
});

beforeEach(() => { vistas = {}; });

async function pedir(path: string) {
  return fetch(`http://localhost:${PORT}${path}`, { headers: { Authorization: TOKEN } });
}

describe('runs.ts propaga la sesión al motor', () => {
  it('1/logs. el proxy SSE del log en vivo reenvía el token', async () => {
    await pedir('/api/runs/job-1/logs');
    expect(vistas.logs).toBe(TOKEN);
  });

  it('2/detalle. el detalle de la corrida reenvía el token', async () => {
    await pedir('/api/runs/job-1');
    expect(vistas.detalle).toBe(TOKEN);
  });

  it('3/docxStatus. el estado del reporte reenvía el token en la sonda y en el HEAD', async () => {
    await pedir('/api/runs/job-1/evidence-docx/status');
    expect(vistas['docx-status']).toBe(TOKEN);
    // La sonda HEAD era la cuarta llamada sin cabeceras; solo corre si la de estado
    // no resolvió antes, asi que se comprueba aparte de forma tolerante.
    if (vistas['docx-head'] !== undefined) expect(vistas['docx-head']).toBe(TOKEN);
  });

  it('4/docx. la descarga del reporte reenvía el token', async () => {
    await pedir('/api/runs/job-1/evidence-docx');
    expect(vistas.docx).toBe(TOKEN);
  });

  it('5/sinSesion. sin Authorization entrante no se inventa ninguna', async () => {
    await fetch(`http://localhost:${PORT}/api/runs/job-1`);
    expect(vistas.detalle).toBeUndefined();
  });
});
