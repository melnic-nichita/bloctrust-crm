const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api/v1';

type ApiProblem = Readonly<{ title?: string; message?: string; code?: string }>;

function readCookie(...names: string[]): string | undefined {
  if (typeof document === 'undefined') return undefined;

  for (const item of document.cookie.split(';')) {
    const [name, ...value] = item.trim().split('=');
    if (name && names.includes(name)) return decodeURIComponent(value.join('='));
  }

  return undefined;
}

export async function apiRequest<T>(
  path: string,
  init: RequestInit = {},
  allowRefresh = true,
): Promise<T> {
  const method = (init.method ?? 'GET').toUpperCase();
  const csrfToken = readCookie('bt_csrf', '__Host-bt_csrf');
  const headers = new Headers(init.headers);

  if (init.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  if (!['GET', 'HEAD', 'OPTIONS'].includes(method) && csrfToken) {
    headers.set('X-CSRF-Token', csrfToken);
  }

  const response = await fetch(`${API_URL}${path}`, {
    ...init,
    headers,
    credentials: 'include',
  });

  if (response.status === 401 && allowRefresh && path !== '/auth/refresh') {
    try {
      await apiRequest('/auth/refresh', { method: 'POST' }, false);
      return apiRequest<T>(path, init, false);
    } catch {
      // The original response remains the most useful error for the caller.
    }
  }

  if (!response.ok) {
    const problem = (await response.json().catch(() => ({}))) as ApiProblem;
    throw new Error(problem.title ?? problem.message ?? `Request failed (${response.status})`);
  }

  return (await response.json()) as T;
}
