import { chromium, Browser } from 'playwright';
import express from 'express';
import { Server } from 'http';
import { AddressInfo } from 'net';
import { scrapeWithChromeCDP } from '../../engines/chrome-cdp';

jest.setTimeout(30000);

const TEST_WITH_BROWSER = process.env.TEST_WITH_BROWSER === 'true';
const describeFn = TEST_WITH_BROWSER ? describe : describe.skip;

describeFn('scrapeWithChromeCDP', () => {
  let browser: Browser;
  let server: Server;
  let port: number;

  beforeAll(async () => {
    browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });

    const app = express();
    app.get('/', (_req, res) => {
      res.send('<html><body><h1>Hello World</h1><button id="btn">Click me</button><p id="result">initial</p></body></html>');
    });
    app.get('/dynamic', (_req, res) => {
      res.send(`<html><body><div id="content">dynamic content</div><script>setTimeout(() => { document.getElementById('content').textContent = 'after wait'; }, 200);</script></body></html>`);
    });
    app.get('/js', (_req, res) => {
      res.send('<html><body><div id="output">old</div></body></html>');
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
    const result = await scrapeWithChromeCDP(browser, {
      url: `http://localhost:${port}/`,
      engine: 'chrome-cdp',
      instantReturn: false,
      timeout: 5000,
    });
    expect(result.content).toContain('Hello World');
    expect(result.pageStatusCode).toBe(200);
  });

  it('should execute wait action', async () => {
    const start = Date.now();
    const result = await scrapeWithChromeCDP(browser, {
      url: `http://localhost:${port}/dynamic`,
      engine: 'chrome-cdp',
      instantReturn: false,
      timeout: 5000,
      actions: [{ type: 'wait', milliseconds: 300 }],
    });
    const elapsed = Date.now() - start;
    expect(elapsed).toBeGreaterThanOrEqual(250);
    expect(result.content).toBeDefined();
    expect(result.pageStatusCode).toBe(200);
  });

  it('should take a screenshot action', async () => {
    const result = await scrapeWithChromeCDP(browser, {
      url: `http://localhost:${port}/`,
      engine: 'chrome-cdp',
      instantReturn: false,
      timeout: 5000,
      actions: [{ type: 'screenshot' }],
    });
    expect(result.screenshots).toBeDefined();
    expect(result.screenshots!.length).toBeGreaterThanOrEqual(1);
    expect(result.screenshots![0]).toBeTruthy();
    expect(result.actionResults).toBeDefined();
    expect(result.actionResults!.some(a => a.type === 'screenshot')).toBe(true);
  });

  it('should execute JavaScript', async () => {
    const result = await scrapeWithChromeCDP(browser, {
      url: `http://localhost:${port}/js`,
      engine: 'chrome-cdp',
      instantReturn: false,
      timeout: 5000,
      actions: [
        {
          type: 'executeJavascript',
          script: 'document.getElementById("output").textContent = "modified"; return "ok";',
        },
      ],
    });
    expect(result.actionResults).toBeDefined();
    expect(result.actionResults!.some(a => a.type === 'executeJavascript')).toBe(true);
    const jsResult = result.actionResults!.find(a => a.type === 'executeJavascript');
    expect(jsResult!.result).toBeDefined();
  });

  it('should scrape page content at action point', async () => {
    const result = await scrapeWithChromeCDP(browser, {
      url: `http://localhost:${port}/`,
      engine: 'chrome-cdp',
      instantReturn: false,
      timeout: 5000,
      actions: [{ type: 'scrape' }],
    });
    expect(result.actionContent).toBeDefined();
    expect(result.actionContent!.length).toBeGreaterThanOrEqual(1);
    expect(result.actionContent![0].html).toContain('Hello World');
  });

  it('should handle errors gracefully on navigation failure', async () => {
    const result = await scrapeWithChromeCDP(browser, {
      url: `http://localhost:${port + 1000}/nonexistent`,
      engine: 'chrome-cdp',
      instantReturn: false,
      timeout: 1000,
    });
    expect(result.pageError).toBeDefined();
    expect(result.pageStatusCode).toBe(0);
  });
});
