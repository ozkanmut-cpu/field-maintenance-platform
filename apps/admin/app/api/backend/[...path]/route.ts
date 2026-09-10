import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { backendBaseUrl, SESSION_COOKIE } from '../../../../lib/backend';

type Context = { params: Promise<{ path: string[] }> };

async function proxy(request: Request, context: Context) {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return NextResponse.json({ message: 'Oturum yok' }, { status: 401 });
  const { path } = await context.params;
  const source = new URL(request.url);
  const target = `${backendBaseUrl()}/${path.join('/')}${source.search}`;
  const body = request.method === 'GET' || request.method === 'HEAD' ? undefined : await request.text();
  const response = await fetch(target, {
    method: request.method,
    body,
    cache: 'no-store',
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body ? { 'Content-Type': request.headers.get('content-type') ?? 'application/json' } : {}),
    },
  });
  const text = await response.text();
  return new NextResponse(text || null, {
    status: response.status,
    headers: { 'Content-Type': response.headers.get('content-type') ?? 'application/json' },
  });
}
export const GET = proxy;
export const POST = proxy;
export const PATCH = proxy;
export const PUT = proxy;
export const DELETE = proxy;
