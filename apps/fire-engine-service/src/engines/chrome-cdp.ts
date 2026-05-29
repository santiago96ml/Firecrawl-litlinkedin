import { Browser, BrowserContext, Page } from 'playwright';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { classifyError } from '../helpers/get-error';
import { ScrapeRequest, ScrapeResult, ActionResult, InternalAction } from '../types';

export async function scrapeWithChromeCDP(
  browser: Browser,
  request: ScrapeRequest,
  options?: { progressCallback?: (jobId: string, status: string) => void },
): Promise<ScrapeResult> {
  let context: BrowserContext | null = null;
  let page: Page | null = null;
  const actionResults: ActionResult[] = [];
  const actionContent: { url: string; html: string }[] = [];
  const screenshots: string[] = [];

  try {
    const contextOptions: any = {
      ignoreHTTPSErrors: request.skipTlsVerification ?? false,
    };

    if (request.geolocation?.languages && request.geolocation.languages.length > 0) {
      contextOptions.locale = request.geolocation.languages[0];
    }

    if (request.geolocation?.country) {
      const timezoneMap: Record<string, string> = {
        US: 'America/New_York',
        GB: 'Europe/London',
        DE: 'Europe/Berlin',
        FR: 'Europe/Paris',
        JP: 'Asia/Tokyo',
        CN: 'Asia/Shanghai',
        BR: 'America/Sao_Paulo',
        AU: 'Australia/Sydney',
        IN: 'Asia/Kolkata',
      };
      contextOptions.timezoneId = timezoneMap[request.geolocation.country] || 'UTC';
    }

    context = await browser.newContext(contextOptions);

    if (request.mobile) {
      await context.addInitScript(() => {
        Object.defineProperty(navigator, 'maxTouchPoints', { get: () => 1 });
      });
    }

    page = await context.newPage();

    if (request.headers) {
      await page.setExtraHTTPHeaders(request.headers);
    }

    if (request.blockMedia) {
      await page.route(/\.(png|jpg|jpeg|gif|svg|mp3|mp4|avi|flac|ogg|wav|webm)(\?|$)/i, async (route) => {
        await route.abort();
      });
    }

    let fileDownload: { name: string; content: string } | undefined;
    page.on('download', async (download) => {
      try {
        const filePath = await download.path();
        if (filePath) {
          const buffer = await fs.promises.readFile(filePath);
          fileDownload = {
            name: download.suggestedFilename(),
            content: buffer.toString('base64'),
          };
        }
      } catch (err) {
        console.error('File download handler error:', err);
      }
    });

    const response = await page.goto(request.url, {
      timeout: request.timeout,
      waitUntil: 'load',
    });

    const pageStatusCode = response ? response.status() : 0;
    const responseHeaders: Record<string, string> = {};
    if (response) {
      const headers = await response.allHeaders();
      for (const [key, value] of Object.entries(headers)) {
        responseHeaders[key] = String(value);
      }
    }

    let content = await page.content();

    if (request.actions && request.actions.length > 0) {
      for (const action of request.actions) {
        await executeAction(page, action, actionResults, actionContent, screenshots);
      }

      const hasScrapeAction = request.actions.some(a => a.type === 'scrape');
      if (!hasScrapeAction) {
        content = await page.content();
      }
    }

    const result: ScrapeResult = {
      content,
      pageStatusCode,
      pageError: undefined,
      responseHeaders: Object.keys(responseHeaders).length > 0 ? responseHeaders : undefined,
      url: page.url(),
    };

    if (screenshots.length > 0) {
      result.screenshots = screenshots;
    }
    if (actionContent.length > 0) {
      result.actionContent = actionContent;
    }
    if (actionResults.length > 0) {
      result.actionResults = actionResults;
    }
    if (fileDownload) {
      result.file = fileDownload;
    }

    return result;
  } catch (err) {
    const pageError = classifyError(err);

    if (err instanceof Error && err.message.includes('ERR_CERT_')) {
      return {
        content: '',
        pageStatusCode: 0,
        pageError,
      };
    }

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

async function executeAction(
  page: Page,
  action: InternalAction,
  actionResults: ActionResult[],
  actionContent: { url: string; html: string }[],
  screenshots: string[],
): Promise<void> {
  switch (action.type) {
    case 'wait':
      await page.waitForTimeout(action.milliseconds ?? 1000);
      break;

    case 'click':
      if (!action.selector) {
        throw new Error('Element selector not found for click action');
      }
      await page.click(action.selector);
      break;

    case 'write':
      if (!action.selector) {
        throw new Error('Element selector not found for write action');
      }
      if (action.text === undefined) {
        throw new Error('Element text not found for write action');
      }
      await page.fill(action.selector, action.text);
      break;

    case 'press':
      if (!action.selector) {
        throw new Error('Element selector not found for press action');
      }
      if (!action.key) {
        throw new Error('Element key not found for press action');
      }
      await page.press(action.selector, action.key);
      break;

    case 'scroll':
      if (action.selector) {
        await page.evaluate((sel: string) => {
          document.querySelector(sel)?.scrollIntoView({ behavior: 'auto', block: 'center' });
        }, action.selector);
      }
      break;

    case 'screenshot': {
      const tmpFile = path.join(os.tmpdir(), `fe-screenshot-${Date.now()}-${Math.random().toString(36).slice(2)}.png`);
      await page.screenshot({ path: tmpFile, fullPage: action.fullPage ?? false });
      const buffer = await fs.promises.readFile(tmpFile);
      const base64 = buffer.toString('base64');
      screenshots.push(base64);
      actionResults.push({ type: 'screenshot', result: { path: tmpFile } });
      fs.promises.unlink(tmpFile).catch(() => {});
      break;
    }

    case 'executeJavascript':
      if (!action.script) {
        throw new Error('Javascript script not found for executeJavascript action');
      }
      try {
        const wrappedScript = `(() => { ${action.script} })()`;
        const returnValue = await page.evaluate(wrappedScript);
        actionResults.push({
          type: 'executeJavascript',
          result: { return: String(returnValue ?? '') },
        });
      } catch (jsErr) {
        const detail = jsErr instanceof Error ? jsErr.message : String(jsErr);
        throw new Error(`Javascript execution failed: ${detail}`);
      }
      break;

    case 'scrape': {
      const html = await page.content();
      actionContent.push({ url: page.url(), html });
      break;
    }

    case 'pdf': {
      const tmpFile = path.join(os.tmpdir(), `fe-pdf-${Date.now()}-${Math.random().toString(36).slice(2)}.pdf`);
      await page.pdf({ path: tmpFile });
      const buffer = await fs.promises.readFile(tmpFile);
      const base64 = buffer.toString('base64');
      actionResults.push({
        type: 'pdf',
        result: { link: `data:application/pdf;base64,${base64}` },
      });
      fs.promises.unlink(tmpFile).catch(() => {});
      break;
    }
  }
}
