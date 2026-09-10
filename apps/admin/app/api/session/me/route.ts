import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { backendFetch, SESSION_COOKIE } from '../../../../lib/backend';

export async function GET() {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return NextResponse.json({ message: 'Oturum yok' }, { status: 401 });
  const response = await backendFetch('/auth/me', {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) return NextResponse.json(data ?? { message: 'Oturum geçersiz' }, { status: response.status });
  if (data?.role !== 'ADMIN') return NextResponse.json({ message: 'Yönetici hesabı gerekli' }, { status: 403 });
  return NextResponse.json(data);
}
