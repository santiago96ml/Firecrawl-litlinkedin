import { chromium, Browser } from 'playwright';
import express from 'express';
import { Server } from 'http';
import { AddressInfo } from 'net';
import { scrapeWithPlaywright } from '../../engines/playwright';

jest.setTimeout(30000);

const TEST_WITH_BROWSER = process.env.TEST_WITH_BROWSER === 'true';
const describeFn = TEST_WITH_BROWSER ? describe : describe.skip;

describeFn('scrapeWithPlaywright', () => {
  let browser: Browser;
  let server: Server;
  let port: number;

  beforeAll(async () => {
    browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });

    const app = express();
    app.get('/', (_req, res) => {
      res.send('<html><body><h1>Playwright Test</h1></body></html>');
    });

    server = app.listen(0);
    await new Promise<void>((resolve) => {
      server.on('listening', () => {
        port = (server.address() as AddressInfo).port;
        resolve();
      });
    });
  });

  afterAll(async () => {
    await browser.close();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it('should scrape basic HTML content', async () => {
    const result = await scrapeWithPlaywright(browser, {
      url: `http://localhost:${port}/`,
      engine: 'playwright',
      instantReturn: false,
      timeout: 5000,
    });
    expect(result.content).toContain('Playwright Test');
    expect(result.pageStatusCode).toBe(200);
  });

  it('should take a screenshot', async () => {
    const result = await scrapeWithPlaywright(browser, {
      url: `http://localhost:${port}/`,
      engine: 'playwright',
      instantReturn: false,
      timeout: 5000,
      screenshot: true,
      fullPageScreenshot: false,
    });
    expect(result.screenshot).toBeDefined();
    expect(typeof result.screenshot).toBe('string');
    expect(result.screenshot!.length).toBeGreaterThan(0);
  });

  it('should respect wait parameter', async () => {
    const start = Date.now();
    const result = await scrapeWithPlaywright(browser, {
      url: `http://localhost:${port}/`,
      engine: 'playwright',
      instantReturn: false,
      timeout: 5000,
      wait: 200,
    });
    const elapsed = Date.now() - start;
    expect(elapsed).toBeGreaterThanOrEqual(150);
    expect(result.content).toContain('Playwright Test');
  });
});
