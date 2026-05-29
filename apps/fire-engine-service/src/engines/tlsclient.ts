import https from 'https';
import http from 'http';
import { URL } from 'url';
import { classifyError } from '../helpers/get-error';

interface TlsClientOptions {
  url: string;
  headers?: Record<string, string>;
  timeout: number;
  skipTlsVerification?: boolean;
  maxRedirects?: number;
}

interface TlsClientResult {
  content: string;
  pageStatusCode: number;
  responseHeaders?: Record<string, string>;
  pageError?: string;
  url?: string;
  timezone?: string;
}

function getTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return 'UTC';
  }
}

function fetchUrl(
  targetUrl: string,
  options: TlsClientOptions,
  redirectCount: number = 0,
): Promise<TlsClientResult> {
  return new Promise((resolve) => {
    const maxRedirects = options.maxRedirects ?? 5;
    if (redirectCount > maxRedirects) {
      resolve({
        content: '',
        pageStatusCode: 0,
        pageError: 'Too many redirects',
        timezone: getTimezone(),
      });
      return;
    }

    let parsedUrl: URL;
    try {
      parsedUrl = new URL(targetUrl);
    } catch {
      resolve({
        content: '',
        pageStatusCode: 0,
        pageError: 'Invalid URL',
        timezone: getTimezone(),
      });
      return;
    }

    const isHttps = parsedUrl.protocol === 'https:';
    const httpModule = isHttps ? https : http;

    const requestOptions: http.RequestOptions = {
      hostname: parsedUrl.hostname,
      port: parsedUrl.port || (isHttps ? 443 : 80),
      path: parsedUrl.pathname + parsedUrl.search,
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; Firecrawl/1.0)',
        ...options.headers,
      },
      timeout: options.timeout,
    } as http.RequestOptions & { rejectUnauthorized?: boolean };

    if (isHttps) {
      (requestOptions as any).rejectUnauthorized = !options.skipTlsVerification;
    }

    const req = httpModule.get(requestOptions, (res) => {
      const chunks: Buffer[] = [];
      const statusCode = res.statusCode ?? 0;

      res.on('data', (chunk: Buffer) => {
        chunks.push(chunk);
      });

      res.on('end', () => {
        const location = res.headers.location;
        const isRedirect = statusCode >= 300 && statusCode < 400 && location;
        if (isRedirect) {
          const locationStr = Array.isArray(location) ? location[0]! : location!;
          const redirectUrl = new URL(locationStr, targetUrl).toString();
          fetchUrl(redirectUrl, options, redirectCount + 1).then(resolve);
          return;
        }

        const content = Buffer.concat(chunks).toString('utf-8');
        const responseHeaders: Record<string, string> = {};
        if (res.headers) {
          for (const [key, value] of Object.entries(res.headers)) {
            responseHeaders[key] = Array.isArray(value) ? value.join(', ') : value ?? '';
          }
        }

        resolve({
          content,
          pageStatusCode: statusCode,
          responseHeaders,
          url: targetUrl,
          timezone: getTimezone(),
        });
      });
    });

    req.on('error', (err: NodeJS.ErrnoException) => {
      const hostname = parsedUrl.hostname;
      const pageError = classifyError(err, { hostname });
      resolve({
        content: '',
        pageStatusCode: 0,
        pageError,
        timezone: getTimezone(),
      });
    });

    req.on('timeout', () => {
      req.destroy();
      resolve({
        content: '',
        pageStatusCode: 0,
        pageError: 'failed to finish without timing out',
        timezone: getTimezone(),
      });
    });
  });
}

export async function scrapeWithTlsClient(options: TlsClientOptions): Promise<TlsClientResult> {
  return fetchUrl(options.url, options);
}
