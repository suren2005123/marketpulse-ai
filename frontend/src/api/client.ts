let currentAccessToken: string | null = null;
let onUnauthenticatedHandler: (() => void) | null = null;

export function setAccessToken(token: string | null) {
  currentAccessToken = token;
}

export function getAccessToken(): string | null {
  return currentAccessToken;
}

export function setOnUnauthenticated(handler: () => void) {
  onUnauthenticatedHandler = handler;
}

async function request<T = any>(
  endpoint: string,
  options: RequestInit = {},
  isRetry = false
): Promise<T> {
  const headers = new Headers(options.headers || {});
  if (options.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  if (currentAccessToken) {
    headers.set('Authorization', `Bearer ${currentAccessToken}`);
  }

  const controller = new AbortController();
  const timeoutMs = 15000;
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  if (options.signal) {
    options.signal.addEventListener('abort', () => controller.abort(), { once: true });
  }

  // Ensure cookies (refreshToken) are sent with every request
  const fetchOptions: RequestInit = {
    ...options,
    headers,
    credentials: 'include',
    signal: controller.signal,
  };

  let response: Response;
  try {
    response = await fetch(endpoint, fetchOptions);
  } catch (err: any) {
    clearTimeout(timeoutId);
    if (err.name === 'AbortError') {
      const timeoutError: any = new Error(`Request to ${endpoint} timed out. Please check backend connectivity.`);
      timeoutError.code = 'TIMEOUT';
      throw timeoutError;
    }
    const networkError: any = new Error(`Unable to connect to backend service. Please ensure the server on port 5000 is running.`);
    networkError.code = 'NETWORK_ERROR';
    networkError.cause = err;
    throw networkError;
  } finally {
    clearTimeout(timeoutId);
  }

  // 401 Unauthorized handling: transparent refresh retry
  if (response.status === 401 && !isRetry && !endpoint.includes('/auth/login') && !endpoint.includes('/auth/refresh')) {
    try {
      const refreshController = new AbortController();
      const timer = setTimeout(() => refreshController.abort(), 6000);
      const refreshRes = await fetch('/api/auth/refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        signal: refreshController.signal,
      });
      clearTimeout(timer);

      if (refreshRes.ok) {
        const refreshData = await refreshRes.json();
        setAccessToken(refreshData.accessToken);
        // Retry original request with newly acquired token
        return request<T>(endpoint, options, true);
      } else {
        setAccessToken(null);
        if (onUnauthenticatedHandler) onUnauthenticatedHandler();
      }
    } catch (e) {
      setAccessToken(null);
      if (onUnauthenticatedHandler) onUnauthenticatedHandler();
    }
  }

  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({}));
    const error: any = new Error(errorBody.error || `Request failed with status ${response.status}`);
    error.status = response.status;
    error.code = errorBody.code;
    error.details = errorBody.details;
    throw error;
  }

  return response.json();
}

export const api = {
  // Existing methods
  get: <T = any>(endpoint: string) => request<T>(endpoint, { method: 'GET' }),
  post: <T = any>(endpoint: string, body?: any) => request<T>(endpoint, { method: 'POST', body: body ? JSON.stringify(body) : undefined }),
  patch: <T = any>(endpoint: string, body?: any) => request<T>(endpoint, { method: 'PATCH', body: body ? JSON.stringify(body) : undefined }),
  delete: <T = any>(endpoint: string) => request<T>(endpoint, { method: 'DELETE' }),
  // Explain My Stock
  explainStock: <T = any>(exchange: string, symbol: string, timeframe: string = '15m') => request<T>(`/api/explain/${exchange}/${symbol}?timeframe=${timeframe}`, { method: 'GET' }),
  // Insights endpoints
  getMarketOverview: <T = any>(exchange: string = 'ALL') => request<T>(`/api/insights/overview/${exchange}`),
  getTopMovers: <T = any>(exchange: string = 'ALL', limit: number = 5) => request<T>(`/api/insights/top-movers/${exchange}/${limit}`),
  getMostActive: <T = any>(exchange: string = 'ALL', limit: number = 5) => request<T>(`/api/insights/most-active/${exchange}/${limit}`),
  getSectorPerformance: <T = any>(exchange: string = 'ALL') => request<T>(`/api/insights/sector-performance/${exchange}`),
  getObservations: <T = any>(exchange: string = 'ALL') => request<T>(`/api/insights/observations/${exchange}`),
};
