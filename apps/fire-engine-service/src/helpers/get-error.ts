export function classifyError(error: unknown, context?: { hostname?: string }): string {
  if (error instanceof Error) {
    const err = error as NodeJS.ErrnoException;
    const code = err.code;
    const message = err.message;

    if (code === 'ENOTFOUND') {
      const hostname = context?.hostname ?? 'unknown';
      return `Dns resolution error for hostname: ${hostname}`;
    }

    if (code === 'ERR_TLS_CERT_ALTNAME_INVALID') {
      return 'Chrome error: ERR_CERT_ALTNAME_INVALID';
    }
    if (code === 'CERT_HAS_EXPIRED') {
      return 'Chrome error: ERR_CERT_HAS_EXPIRED';
    }

    if (code === 'ETIMEDOUT') {
      return 'failed to finish without timing out';
    }

    if (message.includes('Timeout') || err.name === 'TimeoutError') {
      return 'failed to finish without timing out';
    }

    if (message.includes('ERR_CERT_') || message.includes('ERR_SSL_')) {
      const match = message.match(/(ERR_CERT_\w+|ERR_SSL_\w+)/);
      if (match) {
        return `Chrome error: ${match[1]}`;
      }
    }

    if (message.includes('Element') && message.includes('not found')) {
      return message;
    }

    return `Error: ${message}`;
  }

  return String(error);
}

const statusErrorMessages: Record<number, string> = {
  300: 'Multiple Choices',
  301: 'Moved Permanently',
  302: 'Found',
  303: 'See Other',
  304: 'Not Modified',
  305: 'Use Proxy',
  307: 'Temporary Redirect',
  308: 'Permanent Redirect',
  309: 'Resume Incomplete',
  310: 'Too Many Redirects',
  311: 'Unavailable For Legal Reasons',
  312: 'Previously Used',
  313: "I'm Used",
  314: 'Switch Proxy',
  315: 'Temporary Redirect',
  316: 'Resume Incomplete',
  317: 'Too Many Redirects',
  400: 'Bad Request',
  401: 'Unauthorized',
  403: 'Forbidden',
  404: 'Not Found',
  405: 'Method Not Allowed',
  406: 'Not Acceptable',
  407: 'Proxy Authentication Required',
  408: 'Request Timeout',
  409: 'Conflict',
  410: 'Gone',
  411: 'Length Required',
  412: 'Precondition Failed',
  413: 'Payload Too Large',
  414: 'URI Too Long',
  415: 'Unsupported Media Type',
  416: 'Range Not Satisfiable',
  417: 'Expectation Failed',
  418: "I'm a teapot",
  421: 'Misdirected Request',
  422: 'Unprocessable Entity',
  423: 'Locked',
  424: 'Failed Dependency',
  425: 'Too Early',
  426: 'Upgrade Required',
  428: 'Precondition Required',
  429: 'Too Many Requests',
  431: 'Request Header Fields Too Large',
  451: 'Unavailable For Legal Reasons',
  500: 'Internal Server Error',
  501: 'Not Implemented',
  502: 'Bad Gateway',
  503: 'Service Unavailable',
  504: 'Gateway Timeout',
  505: 'HTTP Version Not Supported',
  506: 'Variant Also Negotiates',
  507: 'Insufficient Storage',
  508: 'Loop Detected',
  510: 'Not Extended',
  511: 'Network Authentication Required',
  599: 'Network Connect Timeout Error',
};

export function getPageErrorFromStatusCode(statusCode: number): string | undefined {
  if (statusCode === null || statusCode === undefined) {
    return 'No response received';
  }
  if (statusCode < 300) {
    return undefined;
  }
  return statusErrorMessages[statusCode] || 'Unknown Error';
}
