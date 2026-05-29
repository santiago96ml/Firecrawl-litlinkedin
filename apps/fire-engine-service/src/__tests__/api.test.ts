import { chromium, Browser } from 'playwright';
import express from 'express';
import { Server } from 'http';
import { AddressInfo } from 'net';
import request from 'supertest';
import { createApp } from '../api';
import { JobStore } from '../job-store';

jest.setTimeout(30000);

const TEST_WITH_BROWSER = process.env.TEST_WITH_BROWSER === 'true';
const describeFn = TEST_WITH_BROWSER ? describe : describe.skip;

describeFn('Fire-engine API — full async flow', () => {
  let browser: Browser;
  let testServer: Server;
  let testPort: number;
  let jobStore: JobStore;
  let app: express.Application;

  beforeAll(async () => {
    browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });

    const testApp = express();
    testApp.get('/', (_req, res) => {
      res.send('<html><body><h1>Async Test Page</h1></body></html>');
    });
    testApp.get('/slow', (_req, res) => {
      setTimeout(() => res.send('<html><body><p>Sloooow</p></body></html>'), 100);
    });

    testServer = testApp.listen(0);
    await new Promise<void>((resolve) => {
      testServer.on('listening', () => {
        testPort = (testServer.address() as AddressInfo).port;
        resolve();
      });
    });

    jobStore = new JobStore(60000);
    app = createApp(browser, jobStore);
  });

  afterAll(async () => {
    await browser.close();
    jobStore.destroy();
    await new Promise<void>((resolve) => testServer.close(() => resolve()));
  });

  it('POST /scrape with chrome-cdp returns jobId', async () => {
    const res = await request(app)
      .post('/scrape')
      .send({
        url: `http://localhost:${testPort}/`,
        engine: 'chrome-cdp',
        instantReturn: false,
        timeout: 10000,
      })
      .expect(200);

    expect(res.body.jobId).toBeDefined();
    expect(res.body.processing).toBe(true);
  });

  it('GET /scrape/:jobId returns completed result after processing', async () => {
    const postRes = await request(app)
      .post('/scrape')
      .send({
        url: `http://localhost:${testPort}/`,
        engine: 'chrome-cdp',
        instantReturn: false,
        timeout: 10000,
      });

    const jobId = postRes.body.jobId;
    expect(jobId).toBeDefined();

    let result: any;
    const maxAttempts = 30;
    for (let i = 0; i < maxAttempts; i++) {
      const getRes = await request(app).get(`/scrape/${jobId}`).expect(200);
      if (getRes.body.state === 'completed') {
        result = getRes.body;
        break;
      }
      await new Promise(r => setTimeout(r, 300));
    }

    expect(result).toBeDefined();
    expect(result.state).toBe('completed');
    expect(result.processing).toBe(false);
    expect(result.content).toContain('Async Test Page');
    expect(result.pageStatusCode).toBe(200);
  });

  it('DELETE /scrape/:jobId cleans up the job', async () => {
    const postRes = await request(app)
      .post('/scrape')
      .send({
        url: `http://localhost:${testPort}/`,
        engine: 'chrome-cdp',
        instantReturn: false,
        timeout: 10000,
      });

    const jobId = postRes.body.jobId;
    expect(jobId).toBeDefined();

    let completed = false;
    for (let i = 0; i < 30; i++) {
      const getRes = await request(app).get(`/scrape/${jobId}`);
      if (getRes.body.state === 'completed') {
        completed = true;
        break;
      }
      await new Promise(r => setTimeout(r, 300));
    }
    expect(completed).toBe(true);

    const delRes = await request(app).delete(`/scrape/${jobId}`).expect(200);
    expect(delRes.body.success).toBe(true);

    const getRes = await request(app).get(`/scrape/${jobId}`).expect(404);
  });

  it('GET /scrape/:jobId returns 404 for non-existent job', async () => {
    await request(app).get('/scrape/non-existent-id').expect(404);
  });

  it('POST /scrape returns 400 for missing URL', async () => {
    const res = await request(app)
      .post('/scrape')
      .send({ engine: 'chrome-cdp', instantReturn: false, timeout: 5000 })
      .expect(400);

    expect(res.body.error).toContain('URL');
  });

  it('POST /scrape returns 400 for invalid engine', async () => {
    const res = await request(app)
      .post('/scrape')
      .send({ url: 'http://example.com', engine: 'invalid', instantReturn: false, timeout: 5000 })
      .expect(400);

    expect(res.body.error).toContain('Invalid engine');
  });

  it('GET /health returns healthy status', async () => {
    const res = await request(app).get('/health').expect(200);
    expect(res.body.status).toBe('healthy');
    expect(res.body.uptime).toBeDefined();
  });
});
