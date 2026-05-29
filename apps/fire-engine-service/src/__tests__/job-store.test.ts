import { JobStore } from '../job-store';
import { ScrapeRequest, EngineType, ScrapeResult } from '../types';

function makeRequest(overrides: Partial<ScrapeRequest> = {}): ScrapeRequest {
  return {
    url: 'http://example.com',
    engine: 'tlsclient',
    instantReturn: true,
    timeout: 5000,
    ...overrides,
  } as ScrapeRequest;
}

function makeResult(overrides: Partial<ScrapeResult> = {}): ScrapeResult {
  return {
    content: '<html>ok</html>',
    pageStatusCode: 200,
    ...overrides,
  };
}

describe('JobStore', () => {
  let store: JobStore;

  beforeEach(() => {
    store = new JobStore(60000);
  });

  afterEach(() => {
    store.destroy();
  });

  describe('create', () => {
    it('returns a string job ID', () => {
      const id = store.create({ engine: 'tlsclient', request: makeRequest() });
      expect(typeof id).toBe('string');
      expect(id.length).toBeGreaterThan(0);
    });

    it('creates job with pending status', () => {
      const id = store.create({ engine: 'tlsclient', request: makeRequest() });
      const job = store.get(id);
      expect(job).toBeDefined();
      expect(job!.status).toBe('pending');
    });

    it('stores the engine type and request', () => {
      const id = store.create({ engine: 'chrome-cdp', request: makeRequest() });
      const job = store.get(id);
      expect(job!.engine).toBe('chrome-cdp');
      expect(job!.request.url).toBe('http://example.com');
    });

    it('sets createdAt', () => {
      const id = store.create({ engine: 'tlsclient', request: makeRequest() });
      const job = store.get(id);
      expect(job!.createdAt).toBeInstanceOf(Date);
    });

    it('generates unique IDs', () => {
      const id1 = store.create({ engine: 'tlsclient', request: makeRequest() });
      const id2 = store.create({ engine: 'tlsclient', request: makeRequest() });
      expect(id1).not.toBe(id2);
    });
  });

  describe('get', () => {
    it('returns undefined for non-existent job', () => {
      const job = store.get('non-existent');
      expect(job).toBeUndefined();
    });

    it('returns the job state', () => {
      const id = store.create({ engine: 'tlsclient', request: makeRequest() });
      const job = store.get(id);
      expect(job).toBeDefined();
      expect(job!.id).toBe(id);
    });
  });

  describe('markActive', () => {
    it('transitions job from pending to active', () => {
      const id = store.create({ engine: 'tlsclient', request: makeRequest() });
      store.markActive(id);
      const job = store.get(id);
      expect(job!.status).toBe('active');
    });

    it('does not throw for non-existent job', () => {
      expect(() => store.markActive('non-existent')).not.toThrow();
    });
  });

  describe('complete', () => {
    it('transitions job to completed', () => {
      const id = store.create({ engine: 'tlsclient', request: makeRequest() });
      store.complete(id, makeResult());
      const job = store.get(id);
      expect(job!.status).toBe('completed');
    });

    it('stores the result', () => {
      const id = store.create({ engine: 'tlsclient', request: makeRequest() });
      const result = makeResult({ content: 'test content' });
      store.complete(id, result);
      const job = store.get(id);
      expect(job!.result).toEqual(result);
    });

    it('sets completedAt', () => {
      const id = store.create({ engine: 'tlsclient', request: makeRequest() });
      store.complete(id, makeResult());
      const job = store.get(id);
      expect(job!.completedAt).toBeInstanceOf(Date);
    });
  });

  describe('fail', () => {
    it('transitions job to failed', () => {
      const id = store.create({ engine: 'tlsclient', request: makeRequest() });
      store.fail(id, 'Something went wrong');
      const job = store.get(id);
      expect(job!.status).toBe('failed');
    });

    it('stores the error message', () => {
      const id = store.create({ engine: 'tlsclient', request: makeRequest() });
      store.fail(id, 'Timeout error');
      const job = store.get(id);
      expect(job!.error).toBe('Timeout error');
    });
  });

  describe('delete', () => {
    it('removes the job from the store', () => {
      const id = store.create({ engine: 'tlsclient', request: makeRequest() });
      expect(store.get(id)).toBeDefined();
      const deleted = store.delete(id);
      expect(deleted).toBe(true);
      expect(store.get(id)).toBeUndefined();
    });

    it('returns false for non-existent job', () => {
      const deleted = store.delete('non-existent');
      expect(deleted).toBe(false);
    });
  });

  describe('waitFor', () => {
    it('resolves when job completes', async () => {
      const id = store.create({ engine: 'tlsclient', request: makeRequest() });

      setTimeout(() => {
        store.complete(id, makeResult());
      }, 10);

      const job = await store.waitFor(id, 1000);
      expect(job.status).toBe('completed');
      expect(job.result).toBeDefined();
    });

    it('resolves when job fails', async () => {
      const id = store.create({ engine: 'tlsclient', request: makeRequest() });

      setTimeout(() => {
        store.fail(id, 'error');
      }, 10);

      const job = await store.waitFor(id, 1000);
      expect(job.status).toBe('failed');
      expect(job.error).toBe('error');
    });

    it('rejects on timeout', async () => {
      const id = store.create({ engine: 'tlsclient', request: makeRequest() });

      await expect(store.waitFor(id, 50)).rejects.toThrow('timed out');
    });
  });

  describe('stats', () => {
    it('returns zero for empty store', () => {
      const s = store.stats();
      expect(s.active).toBe(0);
      expect(s.pending).toBe(0);
      expect(s.total).toBe(0);
    });

    it('returns correct counts', () => {
      const id1 = store.create({ engine: 'tlsclient', request: makeRequest() });
      const id2 = store.create({ engine: 'chrome-cdp', request: makeRequest() });
      const id3 = store.create({ engine: 'playwright', request: makeRequest() });

      store.markActive(id1);
      store.complete(id2, makeResult());

      const s = store.stats();
      expect(s.pending).toBe(1);
      expect(s.active).toBe(1);
      expect(s.total).toBe(3);
    });
  });

  describe('TTL cleanup', () => {
    it('removes old completed jobs', () => {
      const shortTtl = 10;
      const shortStore = new JobStore(shortTtl);

      const id = shortStore.create({ engine: 'tlsclient', request: makeRequest() });
      shortStore.complete(id, makeResult());

      expect(shortStore.get(id)).toBeDefined();

      return new Promise<void>((resolve) => {
        setTimeout(() => {
          expect(shortStore.get(id)).toBeUndefined();
          shortStore.destroy();
          resolve();
        }, shortTtl + 50);
      });
    });
  });
});
