/**
 * HTTP client wrapper with automatic retries, exponential backoff, and timeouts.
 *
 * Wraps the native fetch API with retry logic for transient failures.
 * Retries on 5xx status codes and network errors up to MAX_RETRIES times.
 */

const MAX_RETRIES = 3;
const BASE_DELAY_MS = 500;
const DEFAULT_TIMEOUT_MS = 10_000;

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  headers?: Record<string, string>;
  body?: string | object;
  timeout?: number;
  retries?: number;
}

interface HttpResponse<T = unknown> {
  status: number;
  data: T;
  headers: Headers;
}

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function request<T = unknown>(
  url: string,
  options: RequestOptions = {},
): Promise<HttpResponse<T>> {
  const { method = 'GET', headers = {}, body, timeout = DEFAULT_TIMEOUT_MS } = options;
  const maxRetries = options.retries ?? MAX_RETRIES;

  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json', ...headers },
        body: body ? (typeof body === 'string' ? body : JSON.stringify(body)) : undefined,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (response.status >= 500 && attempt < maxRetries) {
        const delay = BASE_DELAY_MS * Math.pow(2, attempt);
        await sleep(delay);
        continue;
      }

      const data = (await response.json()) as T;
      return { status: response.status, data, headers: response.headers };
    } catch (err) {
      clearTimeout(timeoutId);
      lastError = err instanceof Error ? err : new Error(String(err));

      if (attempt < maxRetries) {
        const delay = BASE_DELAY_MS * Math.pow(2, attempt);
        await sleep(delay);
      }
    }
  }

  throw lastError ?? new Error(`Request to ${url} failed after ${maxRetries} retries`);
}
