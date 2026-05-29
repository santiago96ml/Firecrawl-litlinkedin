export type EngineType = 'chrome-cdp' | 'playwright' | 'tlsclient';

export interface InternalAction {
  type: 'wait' | 'click' | 'screenshot' | 'write' | 'press' | 'scroll' | 'executeJavascript' | 'scrape' | 'pdf';
  selector?: string;
  text?: string;
  key?: string;
  milliseconds?: number;
  fullPage?: boolean;
  script?: string;
}

export interface ScrapeRequest {
  url: string;
  scrapeId?: string;
  engine: EngineType;
  instantReturn: boolean;
  headers?: Record<string, string>;
  priority?: number;
  geolocation?: { country?: string; languages?: string[] };
  mobileProxy?: boolean;
  timeout: number;
  zeroDataRetention?: boolean;
  skipTlsVerification?: boolean;
  actions?: InternalAction[];
  blockMedia?: boolean;
  mobile?: boolean;
  blockAds?: boolean;
  screenshot?: boolean;
  fullPageScreenshot?: boolean;
  wait?: number;
  atsv?: boolean;
  disableJsDom?: boolean;
}

export interface ActionResult {
  type: 'screenshot' | 'scrape' | 'executeJavascript' | 'pdf';
  result: any;
}

export interface ScrapeResult {
  content: string;
  pageStatusCode: number;
  pageError?: string;
  url?: string;
  responseHeaders?: Record<string, string>;
  screenshot?: string;
  screenshots?: string[];
  actionContent?: { url: string; html: string }[];
  actionResults?: ActionResult[];
  file?: { name: string; content: string };
  usedMobileProxy?: boolean;
  timezone?: string;
}

export interface JobState {
  id: string;
  status: 'pending' | 'active' | 'completed' | 'failed';
  engine: EngineType;
  request: ScrapeRequest;
  result?: ScrapeResult;
  error?: string;
  createdAt: Date;
  completedAt?: Date;
}

export interface CheckStatusCompleted {
  jobId: string;
  state: 'completed';
  processing: false;
  content: string;
  pageStatusCode: number;
  pageError?: string;
  responseHeaders?: Record<string, string>;
  screenshot?: string;
  screenshots?: string[];
  actionContent?: { url: string; html: string }[];
  actionResults?: ActionResult[];
  file?: { name: string; content: string };
  usedMobileProxy?: boolean;
  timezone?: string;
}

export interface CheckStatusProcessing {
  jobId: string;
  state: 'delayed' | 'active' | 'waiting' | 'pending';
  processing: true;
}

export interface CheckStatusFailed {
  jobId: string;
  state: 'failed';
  processing: false;
  error: string;
}

export interface AsyncResponse {
  jobId: string;
  processing: true;
}
