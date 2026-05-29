import { scrapeWithTlsClient } from '../../engines/tlsclient';

describe('scrapeWithTlsClient', () => {
  let mockHttpGet: jest.SpyInstance;
  let mockHttpsGet: jest.SpyInstance;
  let originalHttp: any;
  let originalHttps: any;

  beforeAll(() => {
    originalHttp = jest.requireActual('http');
    originalHttps = jest.requireActual('https');
  });

  beforeEach(() => {
    mockHttpGet = jest.spyOn(originalHttp, 'get').mockImplementation(() => {
      const mockReq = { on: jest.fn(), setTimeout: jest.fn().mockReturnThis(), destroy: jest.fn() };
      mockReq.setTimeout = jest.fn().mockReturnThis();
      return mockReq;
    });
    mockHttpsGet = jest.spyOn(originalHttps, 'get').mockImplementation(() => {
      const mockReq = { on: jest.fn(), setTimeout: jest.fn().mockReturnThis(), destroy: jest.fn() };
      mockReq.setTimeout = jest.fn().mockReturnThis();
      return mockReq;
    });
  });

  afterEach(() => {
    mockHttpGet.mockRestore();
    mockHttpsGet.mockRestore();
  });

  describe('successful scrape', () => {
    it('returns content and status code for http URL', async () => {
      const chunks: Buffer[] = [];
      const mockIncomingMessage = {
        statusCode: 200,
        headers: { 'content-type': 'text/html' },
        on: (event: string, handler: (...args: any[]) => void) => {
          if (event === 'data') {
            handler(Buffer.from('<html>hello</html>'));
          } else if (event === 'end') {
            handler();
          }
        },
        setTimeout: jest.fn(),
      } as any;

      mockHttpGet.mockImplementation((url: any, opts: any, cb?: any) => {
        const callback = typeof opts === 'function' ? opts : cb;
        if (callback) callback(mockIncomingMessage);
        const mockReq = { on: jest.fn(), setTimeout: jest.fn().mockReturnThis(), destroy: jest.fn() };
        mockReq.setTimeout = jest.fn().mockReturnThis();
        return mockReq;
      });

      const result = await scrapeWithTlsClient({
        url: 'http://example.com',
        timeout: 5000,
      });

      expect(result.content).toBe('<html>hello</html>');
      expect(result.pageStatusCode).toBe(200);
      expect(result.responseHeaders?.['content-type']).toBe('text/html');
    });

    it('returns content and status code for https URL', async () => {
      const mockIncomingMessage = {
        statusCode: 200,
        headers: { 'content-type': 'text/html' },
        on: (event: string, handler: (...args: any[]) => void) => {
          if (event === 'data') {
            handler(Buffer.from('<html>secure</html>'));
          } else if (event === 'end') {
            handler();
          }
        },
        setTimeout: jest.fn(),
      } as any;

      mockHttpsGet.mockImplementation((url: any, opts: any, cb?: any) => {
        const callback = typeof opts === 'function' ? opts : cb;
        if (callback) callback(mockIncomingMessage);
        const mockReq = { on: jest.fn(), setTimeout: jest.fn().mockReturnThis(), destroy: jest.fn() };
        mockReq.setTimeout = jest.fn().mockReturnThis();
        return mockReq;
      });

      const result = await scrapeWithTlsClient({
        url: 'https://example.com',
        timeout: 5000,
      });

      expect(result.content).toBe('<html>secure</html>');
      expect(result.pageStatusCode).toBe(200);
    });

    it('passes custom headers in the request', async () => {
      const mockIncomingMessage = {
        statusCode: 200,
        headers: {},
        on: (event: string, handler: (...args: any[]) => void) => {
          if (event === 'data') handler(Buffer.from(''));
          else if (event === 'end') handler();
        },
        setTimeout: jest.fn(),
      } as any;

      let capturedOpts: any;
      mockHttpGet.mockImplementation((url: any, opts: any, cb?: any) => {
        capturedOpts = typeof url === 'object' ? url : (typeof opts === 'object' ? opts : undefined);
        const callback = typeof opts === 'function' ? opts : cb;
        if (callback) callback(mockIncomingMessage);
        const mockReq = { on: jest.fn(), setTimeout: jest.fn().mockReturnThis(), destroy: jest.fn() };
        mockReq.setTimeout = jest.fn().mockReturnThis();
        return mockReq;
      });

      await scrapeWithTlsClient({
        url: 'http://example.com',
        timeout: 5000,
        headers: { 'X-Custom': 'value', 'User-Agent': 'test-agent' },
      });

      expect(capturedOpts?.headers?.['X-Custom']).toBe('value');
      expect(capturedOpts?.headers?.['User-Agent']).toBe('test-agent');
    });
  });

  describe('error handling', () => {
    it('classifies ENOTFOUND DNS errors', async () => {
      const mockReq = {
        on: (event: string, handler: (...args: any[]) => void) => {
          if (event === 'error') {
            const err: any = new Error('getaddrinfo ENOTFOUND nowhere.example');
            err.code = 'ENOTFOUND';
            handler(err);
          }
        },
        setTimeout: jest.fn().mockReturnThis(),
        destroy: jest.fn(),
      } as any;

      mockHttpGet.mockImplementation(() => mockReq);

      const result = await scrapeWithTlsClient({
        url: 'http://nowhere.example',
        timeout: 5000,
      });

      expect(result.pageStatusCode).toBe(0);
      expect(result.pageError).toContain('Dns resolution error for hostname');
    });

    it('classifies TLS certificate errors', async () => {
      const mockReq = {
        on: (event: string, handler: (...args: any[]) => void) => {
          if (event === 'error') {
            const err: any = new Error('certificate altname mismatch');
            err.code = 'ERR_TLS_CERT_ALTNAME_INVALID';
            handler(err);
          }
        },
        setTimeout: jest.fn().mockReturnThis(),
        destroy: jest.fn(),
      } as any;

      mockHttpsGet.mockImplementation(() => mockReq);

      const result = await scrapeWithTlsClient({
        url: 'https://badssl.example',
        timeout: 5000,
      });

      expect(result.pageStatusCode).toBe(0);
      expect(result.pageError).toContain('Chrome error: ERR_CERT_');
    });

    it('classifies timeout errors', async () => {
      const mockReq = {
        on: (event: string, handler: (...args: any[]) => void) => {
          if (event === 'error') {
            const err: any = new Error('connect ETIMEDOUT');
            err.code = 'ETIMEDOUT';
            handler(err);
          }
        },
        setTimeout: jest.fn().mockReturnThis(),
        destroy: jest.fn(),
      } as any;

      mockHttpGet.mockImplementation(() => mockReq);

      const result = await scrapeWithTlsClient({
        url: 'http://slow.example',
        timeout: 1000,
      });

      expect(result.pageStatusCode).toBe(0);
      expect(result.pageError).toContain('failed to finish without timing out');
    });
  });

  describe('redirect handling', () => {
    it('follows redirect and returns final content', async () => {
      let callCount = 0;

      mockHttpGet.mockImplementation((url: any, opts: any, cb?: any) => {
        const callback = typeof opts === 'function' ? opts : cb;
        callCount++;
        if (callCount === 1) {
          const redirectMsg = {
            statusCode: 302,
            headers: { location: 'http://example.com/final' },
            on: (event: string, handler: (...args: any[]) => void) => {
              if (event === 'data') handler(Buffer.from(''));
              else if (event === 'end') handler();
            },
            setTimeout: jest.fn(),
          } as any;
          callback(redirectMsg);
        } else {
          const finalMsg = {
            statusCode: 200,
            headers: {},
            on: (event: string, handler: (...args: any[]) => void) => {
              if (event === 'data') handler(Buffer.from('final content'));
              else if (event === 'end') handler();
            },
            setTimeout: jest.fn(),
          } as any;
          callback(finalMsg);
        }
        const mockReq = { on: jest.fn(), setTimeout: jest.fn().mockReturnThis(), destroy: jest.fn() };
        mockReq.setTimeout = jest.fn().mockReturnThis();
        return mockReq;
      });

      const result = await scrapeWithTlsClient({
        url: 'http://example.com/redirect',
        timeout: 5000,
      });

      expect(result.content).toBe('final content');
      expect(result.pageStatusCode).toBe(200);
    });
  });

  describe('timezone', () => {
    it('includes timezone in result', async () => {
      const mockIncomingMessage = {
        statusCode: 200,
        headers: {},
        on: (event: string, handler: (...args: any[]) => void) => {
          if (event === 'data') handler(Buffer.from('content'));
          else if (event === 'end') handler();
        },
        setTimeout: jest.fn(),
      } as any;

      mockHttpGet.mockImplementation((url: any, opts: any, cb?: any) => {
        const callback = typeof opts === 'function' ? opts : cb;
        if (callback) callback(mockIncomingMessage);
        const mockReq = { on: jest.fn(), setTimeout: jest.fn().mockReturnThis(), destroy: jest.fn() };
        mockReq.setTimeout = jest.fn().mockReturnThis();
        return mockReq;
      });

      const result = await scrapeWithTlsClient({
        url: 'http://example.com',
        timeout: 5000,
      });

      expect(result.timezone).toBeDefined();
      expect(typeof result.timezone).toBe('string');
    });
  });
});
