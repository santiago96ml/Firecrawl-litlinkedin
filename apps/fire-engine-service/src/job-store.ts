import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';
import { EngineType, ScrapeRequest, ScrapeResult, JobState } from './types';

export class JobStore {
  private jobs: Map<string, JobState>;
  private emitter: EventEmitter;
  private ttlMs: number;
  private cleanupInterval!: NodeJS.Timeout;

  constructor(ttlMs: number = 5 * 60 * 1000) {
    this.jobs = new Map();
    this.emitter = new EventEmitter();
    this.ttlMs = ttlMs;
    this.startCleanup();
  }

  create(params: { engine: EngineType; request: ScrapeRequest }): string {
    const id = uuidv4();
    const job: JobState = {
      id,
      status: 'pending',
      engine: params.engine,
      request: params.request,
      createdAt: new Date(),
    };
    this.jobs.set(id, job);
    return id;
  }

  get(id: string): JobState | undefined {
    return this.jobs.get(id);
  }

  markActive(id: string): void {
    const job = this.jobs.get(id);
    if (job) {
      job.status = 'active';
    }
  }

  complete(id: string, result: ScrapeResult): void {
    const job = this.jobs.get(id);
    if (job) {
      job.status = 'completed';
      job.result = result;
      job.completedAt = new Date();
      this.emitter.emit(`completed:${id}`, job);
    }
  }

  fail(id: string, error: string): void {
    const job = this.jobs.get(id);
    if (job) {
      job.status = 'failed';
      job.error = error;
      job.completedAt = new Date();
      this.emitter.emit(`completed:${id}`, job);
    }
  }

  delete(id: string): boolean {
    return this.jobs.delete(id);
  }

  waitFor(id: string, timeoutMs?: number): Promise<JobState> {
    const existing = this.jobs.get(id);
    if (existing && (existing.status === 'completed' || existing.status === 'failed')) {
      return Promise.resolve(existing);
    }

    return new Promise((resolve, reject) => {
      const timeout = timeoutMs ?? 30000;
      const onComplete = (job: JobState) => {
        clearTimeout(timer);
        resolve(job);
      };
      const timer = setTimeout(() => {
        this.emitter.removeListener(`completed:${id}`, onComplete);
        reject(new Error(`waitFor job ${id} timed out after ${timeout}ms`));
      }, timeout);

      this.emitter.once(`completed:${id}`, onComplete);
    });
  }

  stats(): { active: number; pending: number; total: number } {
    let active = 0;
    let pending = 0;
    let total = 0;

    for (const job of this.jobs.values()) {
      total++;
      if (job.status === 'active') active++;
      if (job.status === 'pending') pending++;
    }

    return { active, pending, total };
  }

  destroy(): void {
    clearInterval(this.cleanupInterval);
  }

  private startCleanup(): void {
    this.cleanupInterval = setInterval(() => {
      const now = Date.now();
      for (const [id, job] of this.jobs.entries()) {
        if (job.completedAt && now - job.completedAt.getTime() > this.ttlMs) {
          this.jobs.delete(id);
        }
      }
    }, Math.min(this.ttlMs, 60000));
  }
}
