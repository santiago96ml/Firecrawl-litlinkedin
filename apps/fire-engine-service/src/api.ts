import express, { Request, Response } from 'express';
import { chromium, Browser } from 'playwright';
import dotenv from 'dotenv';
import { JobStore } from './job-store';
import { scrapeWithChromeCDP } from './engines/chrome-cdp';
import { scrapeWithPlaywright } from './engines/playwright';
import { scrapeWithTlsClient } from './engines/tlsclient';
import {
  ScrapeRequest,
  ScrapeResult,
  AsyncResponse,
  CheckStatusCompleted,
  CheckStatusProcessing,
  CheckStatusFailed,
} from './types';

dotenv.config();

const MAX_CONCURRENT_PAGES = Math.max(1, Number.parseInt(process.env.MAX_CONCURRENT_PAGES ?? '10', 10) || 10);
const PORT = process.env.PORT || 3006;

class Semaphore {
  private permits: number;
  private queue: (() => void)[] = [];

  constructor(permits: number) {
    this.permits = permits;
  }

  async acquire(): Promise<void> {
    if (this.permits > 0) {
      this.permits--;
      return;
    }
    return new Promise<void>((resolve) => {
      this.queue.push(resolve);
    });
  }

  release(): void {
    this.permits++;
    const next = this.queue.shift();
    if (next) {
      this.permits--;
      next();
    }
  }

  getAvailablePermits(): number {
    return this.permits;
  }

  getQueueLength(): number {
    return this.queue.length;
  }
}

export function createApp(browser: Browser, jobStore: JobStore): express.Application {
  const app = express();
  app.use(express.json({ limit: '50mb' }));
  const engineSemaphore = new Semaphore(MAX_CONCURRENT_PAGES);

  app.post('/scrape', async (req: Request, res: Response) => {
    try {
      const scrapeReq = req.body as ScrapeRequest;

      if (!scrapeReq.url) {
        return res.status(400).json({ error: 'URL is required' });
      }

      if (!['chrome-cdp', 'playwright', 'tlsclient'].includes(scrapeReq.engine)) {
        return res.status(400).json({ error: `Invalid engine: ${scrapeReq.engine}` });
      }

      if (scrapeReq.engine === 'tlsclient') {
        const result = await scrapeWithTlsClient({
          url: scrapeReq.url,
          headers: scrapeReq.headers,
          timeout: scrapeReq.timeout,
          skipTlsVerification: scrapeReq.skipTlsVerification,
        });
        return res.json(result);
      }

      const jobId = jobStore.create({ engine: scrapeReq.engine, request: scrapeReq });
      jobStore.markActive(jobId);

      processAsyncJob(browser, jobStore, scrapeReq, jobId, engineSemaphore).catch((err) => {
        console.error(`Job ${jobId} failed:`, err);
        jobStore.fail(jobId, err instanceof Error ? err.message : String(err));
      });

      const response: AsyncResponse = { jobId, processing: true };
      return res.json(response);
    } catch (err) {
      console.error('POST /scrape error:', err);
      return res.status(500).json({ error: 'Internal server error' });
    }
  });

  app.get('/scrape/:jobId', (req: Request, res: Response) => {
    const jobId = String(req.params.jobId);
    const job = jobStore.get(jobId);

    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }

    if (job.status === 'completed' && job.result) {
      const r = job.result;
      const response: CheckStatusCompleted = {
        jobId: job.id,
        state: 'completed',
        processing: false,
        content: r.content,
        pageStatusCode: r.pageStatusCode,
        ...(r.pageError ? { pageError: r.pageError } : {}),
        ...(r.responseHeaders ? { responseHeaders: r.responseHeaders } : {}),
        ...(r.screenshot ? { screenshot: r.screenshot } : {}),
        ...(r.screenshots ? { screenshots: r.screenshots } : {}),
        ...(r.actionContent ? { actionContent: r.actionContent } : {}),
        ...(r.actionResults ? { actionResults: r.actionResults } : {}),
        ...(r.file ? { file: r.file } : {}),
        ...(r.usedMobileProxy !== undefined ? { usedMobileProxy: r.usedMobileProxy } : {}),
        ...(r.timezone ? { timezone: r.timezone } : {}),
      };
      return res.json(response);
    }

    if (job.status === 'failed') {
      const response: CheckStatusFailed = {
        jobId: job.id,
        state: 'failed',
        processing: false,
        error: job.error ?? 'Unknown error',
      };
      return res.json(response);
    }

    const response: CheckStatusProcessing = {
      jobId: job.id,
      state: job.status === 'pending' ? 'pending' : 'active',
      processing: true,
    };
    return res.json(response);
  });

  app.delete('/scrape/:jobId', (req: Request, res: Response) => {
    const jobId = String(req.params.jobId);
    const deleted = jobStore.delete(jobId);
    return res.status(deleted ? 200 : 404).json({ success: deleted });
  });

  app.get('/health', (_req: Request, res: Response) => {
    try {
      const stats = jobStore.stats();
      res.json({
        status: 'healthy',
        uptime: process.uptime(),
        activeJobs: stats.active,
        pendingJobs: stats.pending,
        maxConcurrentPages: MAX_CONCURRENT_PAGES,
      });
    } catch (err) {
      res.status(503).json({ status: 'unhealthy', error: String(err) });
    }
  });

  return app;
}

async function processAsyncJob(
  browser: Browser,
  jobStore: JobStore,
  request: ScrapeRequest,
  jobId: string,
  semaphore: Semaphore,
): Promise<void> {
  await semaphore.acquire();
  try {
    let result: ScrapeResult;
    if (request.engine === 'chrome-cdp') {
      result = await scrapeWithChromeCDP(browser, request, {
        progressCallback: (id, status) => {
          if (status === 'active') jobStore.markActive(id);
        },
      });
    } else if (request.engine === 'playwright') {
      result = await scrapeWithPlaywright(browser, request);
    } else {
      throw new Error(`Unknown engine: ${request.engine}`);
    }
    jobStore.complete(jobId, result);
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    jobStore.fail(jobId, errorMsg);
  } finally {
    semaphore.release();
  }
}

async function main(): Promise<void> {
  const browser = await chromium.launch({
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
    ],
  });

  const jobStore = new JobStore();
  const app = createApp(browser, jobStore);

  app.listen(PORT, () => {
    console.log(`Fire-engine service listening on port ${PORT}`);
  });

  process.on('SIGINT', async () => {
    console.log('Shutting down...');
    await browser.close();
    jobStore.destroy();
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    console.log('Shutting down...');
    await browser.close();
    jobStore.destroy();
    process.exit(0);
  });
}

if (require.main === module) {
  main().catch((err) => {
    console.error('Failed to start fire-engine service:', err);
    process.exit(1);
  });
}
