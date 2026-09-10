export const SESSION_COOKIE = 'fmp_admin_token';

export function backendBaseUrl() {
  return process.env.API_INTERNAL_BASE_URL ?? 'http://127.0.0.1:3000/api';
}

export async function backendFetch(path: string, init: RequestInit = {}) {
  return fetch(`${backendBaseUrl()}${path}`, {
    ...init,
    cache: 'no-store',
    headers: {
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  });
}
