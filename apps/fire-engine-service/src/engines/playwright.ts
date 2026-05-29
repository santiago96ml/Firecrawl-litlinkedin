import { Browser, BrowserContext, Page } from 'playwright';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { classifyError, getPageErrorFromStatusCode } from '../helpers/get-error';
import { ScrapeRequest, ScrapeResult } from '../types';

const AD_SERVING_DOMAINS = [
  'doubleclick.net',
  'adservice.google.com',
  'googlesyndication.com',
  'googletagservices.com',
  'googletagmanager.com',
  'google-analytics.com',
  'adsystem.com',
  'adservice.com',
  'adnxs.com',
  'ads-twitter.com',
  'facebook.net',
  'fbcdn.net',
  'amazon-adsystem.com',
];

export async function scrapeWithPlaywright(
  browser: Browser,
  request: ScrapeRequest,
): Promise<ScrapeResult> {
  let context: BrowserContext | null = null;
  let page: Page | null = null;

  try {
    context = await browser.newContext({
      viewport: { width: 1280, height: 800 },
      ignoreHTTPSErrors: request.skipTlsVerification ?? false,
    });

    page = await context.newPage();

    if (request.blockAds) {
      await page.route('**/*', async (route) => {
        const requestUrl = route.request().url();
        try {
          const hostname = new URL(requestUrl).hostname.toLowerCase();
          if (AD_SERVING_DOMAINS.some(domain => hostname.includes(domain))) {
            await route.abort();
            return;
          }
        } catch {}
        await route.continue();
      });
    }

    if (request.headers) {
      await page.setExtraHTTPHeaders(request.headers);
    }

    const response = await page.goto(request.url, {
      timeout: request.timeout,
      waitUntil: 'load',
    });

    if (request.wait && request.wait > 0) {
      await page.waitForTimeout(request.wait);
    }

    const pageStatusCode = response ? response.status() : 0;
    const responseHeaders: Record<string, string> = {};
    if (response) {
      const headers = await response.allHeaders();
      for (const [key, value] of Object.entries(headers)) {
        responseHeaders[key] = String(value);
      }
    }

    const content = await page.content();

    let screenshot: string | undefined;
    const screenshots: string[] = [];

    if (request.screenshot) {
      const tmpFile = path.join(os.tmpdir(), `fe-pw-ss-${Date.now()}-${Math.random().toString(36).slice(2)}.png`);
      await page.screenshot({ path: tmpFile, fullPage: request.fullPageScreenshot ?? false });
      const buffer = await fs.promises.readFile(tmpFile);
      screenshot = buffer.toString('base64');
      screenshots.push(screenshot);
      fs.promises.unlink(tmpFile).catch(() => {});
    }

    const result: ScrapeResult = {
      content,
      pageStatusCode,
      pageError: pageStatusCode !== 200 ? getPageErrorFromStatusCode(pageStatusCode) : undefined,
      responseHeaders: Object.keys(responseHeaders).length > 0 ? responseHeaders : undefined,
      url: page.url(),
    };

    if (screenshot) {
      result.screenshot = screenshot;
    }
    if (screenshots.length > 0) {
      result.screenshots = screenshots;
    }

    return result;
  } catch (err) {
    const pageError = classifyError(err);

    if (err instanceof Error && err.message.includes('Timeout')) {
      return {
        content: '',
        pageStatusCode: 0,
        pageError: 'failed to finish without timing out',
      };
    }

    return {
      content: '',
      pageStatusCode: 0,
      pageError,
    };
  } finally {
    if (page) {
      await page.close().catch(() => {});
    }
    if (context) {
      await context.close().catch(() => {});
    }
  }
}
