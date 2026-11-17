import { auth } from './firebase';
import { SubscriptionRecord } from '../types/iptv';

function randomChars(length: number, charset: string): string {
  const array = new Uint32Array(length);
  crypto.getRandomValues(array);
  let out = '';
  for (let i = 0; i < length; i++) {
    out += charset[array[i] % charset.length];
  }
  return out;
}

export function generateXtreamUsername(): string {
  return `xs_${randomChars(7, '23456789abcdefghjkmnpqrstuvwxyz')}`;
}

export function generateXtreamPassword(): string {
  return randomChars(10, 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789');
}

export function generateSafeId(prefix: string): string {
  return `${prefix}_${Date.now()}_${randomChars(6, 'abcdefghjkmnpqrstuvwxyz23456789')}`;
}

export function generateTransactionRef(): string {
  return `TXN-${randomChars(8, 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789')}`;
}

/**
 * Resolves the public-facing Xtream host URL.
 * Converts protected AI Studio dev-preview URLs (ais-dev-*) to public shared URLs (ais-pre-*)
 * so external IPTV apps (IPTV Smarters, TiviMate, VLC) don't hit a Google login redirect.
 */
export function getPublicXtreamHost(rawOrigin?: string): string {
  const origin = (rawOrigin || window.location.origin).replace(/\/+$/, '');
  if (origin.includes('://ais-dev-')) {
    return origin.replace('://ais-dev-', '://ais-pre-');
  }
  return origin;
}

export function buildM3uUrl(host: string, username: string, password: string): string {
  const cleanHost = getPublicXtreamHost(host);
  return `${cleanHost}/get.php?username=${encodeURIComponent(username)}&password=${encodeURIComponent(password)}&type=m3u_plus&output=m3u8`;
}

export function formatAzDate(input: unknown): string {
  if (!input) return '—';
  let date: Date | null = null;
  if (typeof input === 'string') {
    date = new Date(input);
  } else if (
    typeof input === 'object' &&
    input !== null &&
    'toDate' in input &&
    typeof (input as { toDate: () => Date }).toDate === 'function'
  ) {
    date = (input as { toDate: () => Date }).toDate();
  }
  if (!date || Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString('az-AZ', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function getRemainingDays(expiresAt?: string): number {
  if (!expiresAt) return 0;
  const diff = new Date(expiresAt).getTime() - Date.now();
  if (diff <= 0) return 0;
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

export async function syncSubscriptionToServer(sub: Partial<SubscriptionRecord>): Promise<void> {
  const user = auth.currentUser;
  if (!user) return;
  try {
    const token = await user.getIdToken();
    await fetch('/api/xtream/sync', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        subscriptionId: sub.id,
        userId: sub.userId,
        userEmail: sub.userEmail,
        userName: sub.userName,
        planId: sub.planId,
        planName: sub.planName,
        durationDays: sub.durationDays,
        maxConnections: sub.maxConnections,
        status: sub.status,
        xtreamUsername: sub.xtreamUsername,
        xtreamPassword: sub.xtreamPassword,
        activatedAt: sub.activatedAt,
        expiresAt: sub.expiresAt,
      }),
    });
  } catch (err) {
    console.warn('Xtream backend sync skipped:', err);
  }
}

export async function syncBatchToServer(subs: SubscriptionRecord[]): Promise<void> {
  const user = auth.currentUser;
  if (!user || subs.length === 0) return;
  try {
    const token = await user.getIdToken();
    await fetch('/api/xtream/sync-batch', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        items: subs.map((s) => ({
          subscriptionId: s.id,
          userId: s.userId,
          userEmail: s.userEmail,
          userName: s.userName,
          planId: s.planId,
          planName: s.planName,
          durationDays: s.durationDays,
          maxConnections: s.maxConnections,
          status: s.status,
          xtreamUsername: s.xtreamUsername,
          xtreamPassword: s.xtreamPassword,
          activatedAt: s.activatedAt,
          expiresAt: s.expiresAt,
        })),
      }),
    });
  } catch (err) {
    console.warn('Xtream batch sync skipped:', err);
  }
}
