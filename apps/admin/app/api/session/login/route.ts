import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { backendFetch, SESSION_COOKIE } from '../../../../lib/backend';

export async function POST(request: Request) {
  const body = await request.text();
  const response = await backendFetch('/auth/login', { method: 'POST', body });
  const data = await response.json().catch(() => null);
  if (!response.ok) return NextResponse.json(data ?? { message: 'Giriş başarısız' }, { status: response.status });
  if (data?.user?.role !== 'ADMIN') {
    return NextResponse.json({ message: 'Yönetici hesabı gerekli' }, { status: 403 });
  }
  const store = await cookies();
  store.set(SESSION_COOKIE, data.accessToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: data.expiresIn,
  });
  return NextResponse.json({ user: data.user, expiresIn: data.expiresIn });
}
