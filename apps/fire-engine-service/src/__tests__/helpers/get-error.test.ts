import { classifyError, getPageErrorFromStatusCode } from '../../helpers/get-error';

describe('classifyError', () => {
  it('classifies ENOTFOUND as DNS resolution error', () => {
    const err = new Error('getaddrinfo ENOTFOUND example.com');
    (err as any).code = 'ENOTFOUND';
    const result = classifyError(err, { hostname: 'example.com' });
    expect(result).toBe('Dns resolution error for hostname: example.com');
  });

  it('classifies ENOTFOUND without hostname context', () => {
    const err = new Error('getaddrinfo ENOTFOUND');
    (err as any).code = 'ENOTFOUND';
    const result = classifyError(err);
    expect(result).toBe('Dns resolution error for hostname: unknown');
  });

  it('classifies ERR_TLS_CERT_ALTNAME_INVALID as Chrome error', () => {
    const err = new Error('certificate altname mismatch');
    (err as any).code = 'ERR_TLS_CERT_ALTNAME_INVALID';
    const result = classifyError(err);
    expect(result).toBe('Chrome error: ERR_CERT_ALTNAME_INVALID');
  });

  it('classifies CERT_HAS_EXPIRED as Chrome error', () => {
    const err = new Error('certificate has expired');
    (err as any).code = 'CERT_HAS_EXPIRED';
    const result = classifyError(err);
    expect(result).toBe('Chrome error: ERR_CERT_HAS_EXPIRED');
  });

  it('classifies ETIMEDOUT as timeout error', () => {
    const err = new Error('connect ETIMEDOUT 1.2.3.4:80');
    (err as any).code = 'ETIMEDOUT';
    const result = classifyError(err);
    expect(result).toBe('failed to finish without timing out');
  });

  it('classifies Error with Timeout message as timeout error', () => {
    const err = new Error('Timeout waiting for page load');
    const result = classifyError(err);
    expect(result).toBe('failed to finish without timing out');
  });

  it('passes through unknown errors as toString', () => {
    const err = new Error('Something unexpected happened');
    const result = classifyError(err);
    expect(result).toBe('Error: Something unexpected happened');
  });

  it('handles non-Error objects', () => {
    const result = classifyError('string error');
    expect(result).toBe('string error');
  });

  it('handles null/undefined', () => {
    expect(classifyError(null)).toBe('null');
    expect(classifyError(undefined)).toBe('undefined');
  });

  it('classifies Playwright TimeoutError', () => {
    const err = new Error('Timeout 30000ms exceeded');
    err.name = 'TimeoutError';
    const result = classifyError(err);
    expect(result).toBe('failed to finish without timing out');
  });

  it('classifies Playwright navigation with ERR_CERT_', () => {
    const err = new Error('Navigation failed because ERR_CERT_AUTHORITY_INVALID');
    const result = classifyError(err);
    expect(result).toBe('Chrome error: ERR_CERT_AUTHORITY_INVALID');
  });

  it('classifies Playwright navigation with ERR_SSL_', () => {
    const err = new Error('Navigation failed because ERR_SSL_PROTOCOL_ERROR');
    const result = classifyError(err);
    expect(result).toBe('Chrome error: ERR_SSL_PROTOCOL_ERROR');
  });

  it('passes Playwright element not found error', () => {
    const err = new Error('Element .non-existent not found');
    const result = classifyError(err);
    expect(result).toBe('Element .non-existent not found');
  });
});

describe('getPageErrorFromStatusCode', () => {
  it('returns null for status codes under 300', () => {
    expect(getPageErrorFromStatusCode(200)).toBeUndefined();
    expect(getPageErrorFromStatusCode(204)).toBeUndefined();
    expect(getPageErrorFromStatusCode(101)).toBeUndefined();
  });

  it('returns error message for 4xx codes', () => {
    expect(getPageErrorFromStatusCode(404)).toBe('Not Found');
    expect(getPageErrorFromStatusCode(403)).toBe('Forbidden');
    expect(getPageErrorFromStatusCode(429)).toBe('Too Many Requests');
  });

  it('returns error message for 5xx codes', () => {
    expect(getPageErrorFromStatusCode(500)).toBe('Internal Server Error');
    expect(getPageErrorFromStatusCode(502)).toBe('Bad Gateway');
    expect(getPageErrorFromStatusCode(503)).toBe('Service Unavailable');
  });

  it('returns Unknown Error for unrecognized codes', () => {
    expect(getPageErrorFromStatusCode(999)).toBe('Unknown Error');
  });

  it('handles null status code', () => {
    expect(getPageErrorFromStatusCode(null as any)).toBe('No response received');
  });
});
