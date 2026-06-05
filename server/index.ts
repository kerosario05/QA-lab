import './env';
import express from 'express';
import cors from 'cors';
import testrailRouter from './routes/testrail';
import jiraRouter from './routes/jira';
import scenariosRouter from './routes/scenarios';

const app = express();
const PORT = parseInt(process.env.PORT ?? '3001', 10);

app.use(cors({ origin: true, credentials: true }));
app.use(express.json());

app.use('/api/testrail', testrailRouter);
app.use('/api/jira', jiraRouter);
app.use('/api/scenarios', scenariosRouter);

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, service: 'qa-lab-backend', timestamp: Date.now() });
});

app.listen(PORT, () => {
  console.log(`[qa-lab-server] API listening on http://localhost:${PORT}`);
  console.log(`[qa-lab-server] routes: /api/testrail/*, /api/jira/*, /api/scenarios/*`);
  const railEnv = { url: !!process.env.TESTRAIL_URL, email: !!process.env.TESTRAIL_EMAIL, key: !!process.env.TESTRAIL_API_KEY };
  console.log(`[qa-lab-server] TESTRAIL_URL=${railEnv.url} TESTRAIL_EMAIL=${railEnv.email} TESTRAIL_API_KEY=${railEnv.key}`);
});
