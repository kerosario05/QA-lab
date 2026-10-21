import { randomUUID } from 'node:crypto';
import { createHash } from 'node:crypto';
import type { ProviderResponse, ScenarioPreviewPayload } from './scenario-preview-provider';

/** Short HTTP requests keep generation independent of gateway request deadlines. */
export class ScenarioPreviewTasks {
  private readonly tasks = new Map<string, { key: string; created: number; finished?: number; result?: ProviderResponse }>();
  private readonly generate: (payload: ScenarioPreviewPayload) => Promise<ProviderResponse>;
  constructor(generate: (payload: ScenarioPreviewPayload) => Promise<ProviderResponse>) { this.generate = generate; }
  start(payload: ScenarioPreviewPayload): string {
    const now = Date.now();
    for (const [id, task] of this.tasks) {
      if (task.finished !== undefined && now - task.finished > 30 * 60_000) this.tasks.delete(id);
    }
    const key = createHash('sha256').update(JSON.stringify(payload)).digest('hex');
    // Retrying while AI is working must not launch another costly generation.
    for (const [id, task] of this.tasks) if (task.finished === undefined && task.key === key) return id;
    if (this.tasks.size >= 32) throw new Error('PREVIEW_QUEUE_FULL');
    const taskId = randomUUID();
    const task: { key: string; created: number; finished?: number; result?: ProviderResponse } = { key, created: now };
    this.tasks.set(taskId, task);
    void Promise.resolve().then(() => this.generate(payload)).then(result => {
      // Match the public preview contract; retain no raw engine/context package.
      const { rawEngineResponse: _rawEngineResponse, ...publicResult } = result;
      task.result = publicResult;
      task.finished = Date.now();
    }).catch(() => {
      task.result = { ok: false, errorCode: 'PREVIEW_PROVIDER_ERROR', error: 'Scenario generation failed' };
      task.finished = Date.now();
    });
    return taskId;
  }
  get(id: string) {
    const task = this.tasks.get(id);
    return task ? task.result ? { state: 'completed' as const, result: task.result } : { state: 'running' as const } : undefined;
  }
}
