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
  headers.set('Content-Type', 'application/json');

  if (currentAccessToken) {
    headers.set('Authorization', `Bearer ${currentAccessToken}`);
  }

  // Ensure cookies (refreshToken) are sent with every request
  const fetchOptions: RequestInit = {
    ...options,
    headers,
    credentials: 'include',
  };

  const response = await fetch(endpoint, fetchOptions);

  // 401 Unauthorized handling: transparent refresh retry
  if (response.status === 401 && !isRetry && !endpoint.includes('/auth/login') && !endpoint.includes('/auth/refresh')) {
    try {
      const refreshRes = await fetch('/api/auth/refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
      });

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
  get: <T = any>(endpoint: string) => request<T>(endpoint, { method: 'GET' }),
  post: <T = any>(endpoint: string, body?: any) =>
    request<T>(endpoint, { method: 'POST', body: body ? JSON.stringify(body) : undefined }),
  patch: <T = any>(endpoint: string, body?: any) =>
    request<T>(endpoint, { method: 'PATCH', body: body ? JSON.stringify(body) : undefined }),
  delete: <T = any>(endpoint: string) => request<T>(endpoint, { method: 'DELETE' }),
};
