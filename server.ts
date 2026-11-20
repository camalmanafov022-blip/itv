import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const M3U_SOURCE_URL = 'https://raw.githubusercontent.com/camalmanafov022-blip/Yeni/refs/heads/main/azer.m3u';
const ADMIN_EMAIL = 'camalmanafov022@gmail.com';

function resolvePort(): number {
  const args = process.argv.slice(2);
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--port' && args[i + 1]) {
      const parsed = Number(args[i + 1]);
      if (!Number.isNaN(parsed) && parsed > 0) return parsed;
    }
    if (args[i].startsWith('--port=')) {
      const parsed = Number(args[i].split('=')[1]);
      if (!Number.isNaN(parsed) && parsed > 0) return parsed;
    }
  }
  if (process.env.NODE_ENV === 'production' && process.env.PORT) {
    return Number(process.env.PORT);
  }
  return 3000;
}

const PORT = resolvePort();
const DATA_DIR = path.join(__dirname, 'data');
const ACCOUNTS_FILE = path.join(DATA_DIR, 'xtream-accounts.json');

interface ChannelItem {
  streamId: number;
  name: string;
  logo: string;
  group: string;
  categoryId: string;
  chno: string;
  tvgId: string;
  url: string;
}

interface CategoryItem {
  id: string;
  name: string;
  count: number;
}

interface XtreamAccountRecord {
  subscriptionId: string;
  userId: string;
  userEmail: string;
  userName: string;
  planId: string;
  planName: string;
  durationDays: number;
  maxConnections: number;
  status: 'pending' | 'active' | 'rejected' | 'expired';
  xtreamUsername: string;
  xtreamPassword: string;
  activatedAt?: string;
  expiresAt?: string;
  updatedAt: string;
}

interface FirebaseConfig {
  apiKey: string;
  projectId: string;
  firestoreDatabaseId?: string;
}

function loadFirebaseConfig(): FirebaseConfig {
  const cfgPath = path.join(__dirname, 'firebase-applet-config.json');
  const raw = fs.readFileSync(cfgPath, 'utf-8');
  return JSON.parse(raw) as FirebaseConfig;
}

const firebaseConfig = loadFirebaseConfig();

function ensureAccountsStore(): Record<string, XtreamAccountRecord> {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(ACCOUNTS_FILE)) {
    fs.writeFileSync(ACCOUNTS_FILE, JSON.stringify({}, null, 2), 'utf-8');
    return {};
  }
  try {
    const raw = fs.readFileSync(ACCOUNTS_FILE, 'utf-8');
    return JSON.parse(raw) as Record<string, XtreamAccountRecord>;
  } catch {
    return {};
  }
}

function saveAccountsStore(store: Record<string, XtreamAccountRecord>): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  fs.writeFileSync(ACCOUNTS_FILE, JSON.stringify(store, null, 2), 'utf-8');
}

function findAccountByCredentials(username: string, password: string): XtreamAccountRecord | null {
  if (!username || !password) return null;
  const store = ensureAccountsStore();
  for (const record of Object.values(store)) {
    if (record.xtreamUsername === username && record.xtreamPassword === password) {
      return record;
    }
  }
  return null;
}

function isAccountCurrentlyActive(account: XtreamAccountRecord): boolean {
  if (account.status !== 'active') return false;
  if (!account.expiresAt) return true;
  return new Date(account.expiresAt).getTime() > Date.now();
}

let cachedChannels: ChannelItem[] = [];
let cachedCategories: CategoryItem[] = [];
let lastFetchTime = 0;
const CACHE_TTL_MS = 15 * 60 * 1000;

function parseM3UContent(rawText: string): { channels: ChannelItem[]; categories: CategoryItem[] } {
  const parts = rawText.split('#EXTINF:');
  const channels: ChannelItem[] = [];
  const categoryCountMap = new Map<string, number>();
  const categoryIdMap = new Map<string, string>();
  let nextCatIndex = 1;
  let fallbackStreamId = 100001;

  for (let i = 1; i < parts.length; i++) {
    const part = parts[i];
    const urlIdx = part.lastIndexOf('http');
    if (urlIdx === -1) continue;

    const metaAndTitle = part.slice(0, urlIdx);
    const streamUrl = part.slice(urlIdx).trim();
    const commaIdx = metaAndTitle.indexOf(',');
    if (commaIdx === -1) continue;

    const meta = metaAndTitle.slice(0, commaIdx);
    const rawName = metaAndTitle.slice(commaIdx + 1).trim();
    if (!rawName || (rawName.startsWith('##') && rawName.endsWith('##'))) {
      continue;
    }

    const logoMatch = meta.match(/tvg-logo="([^"]*)"/);
    const groupMatch = meta.match(/group-title="([^"]*)"/);
    const chnoMatch = meta.match(/tvg-chno="([^"]*)"/);
    const idMatch = meta.match(/tvg-id="([^"]*)"/);

    const group = (groupMatch?.[1] || 'Digər Kanallar').trim();
    if (!categoryIdMap.has(group)) {
      categoryIdMap.set(group, String(nextCatIndex++));
    }
    const categoryId = categoryIdMap.get(group)!;
    categoryCountMap.set(group, (categoryCountMap.get(group) || 0) + 1);

    const urlIdMatch = streamUrl.match(/\/(\d+)\.(m3u8|ts)/);
    const streamId = urlIdMatch ? Number(urlIdMatch[1]) : fallbackStreamId++;

    channels.push({
      streamId,
      name: rawName,
      logo: (logoMatch?.[1] || '').trim(),
      group,
      categoryId,
      chno: (chnoMatch?.[1] || String(channels.length + 1)).trim(),
      tvgId: (idMatch?.[1] || '').trim(),
      url: streamUrl,
    });
  }

  const categories: CategoryItem[] = Array.from(categoryIdMap.entries()).map(([name, id]) => ({
    id,
    name,
    count: categoryCountMap.get(name) || 0,
  }));

  return { channels, categories };
}

async function getPlaylistData(forceRefresh = false): Promise<{
  channels: ChannelItem[];
  categories: CategoryItem[];
  updatedAt: string;
}> {
  const now = Date.now();
  if (!forceRefresh && cachedChannels.length > 0 && now - lastFetchTime < CACHE_TTL_MS) {
    return {
      channels: cachedChannels,
      categories: cachedCategories,
      updatedAt: new Date(lastFetchTime).toISOString(),
    };
  }

  const response = await fetch(M3U_SOURCE_URL, {
    headers: { 'User-Agent': 'XazarStream-IPTV/1.0' },
  });
  if (!response.ok) {
    if (cachedChannels.length > 0) {
      return {
        channels: cachedChannels,
        categories: cachedCategories,
        updatedAt: new Date(lastFetchTime).toISOString(),
      };
    }
    throw new Error(`M3U fetch failed: ${response.status}`);
  }

  const text = await response.text();
  const parsed = parseM3UContent(text);
  cachedChannels = parsed.channels;
  cachedCategories = parsed.categories;
  lastFetchTime = now;

  return {
    channels: cachedChannels,
    categories: cachedCategories,
    updatedAt: new Date(lastFetchTime).toISOString(),
  };
}

interface VerifiedFirebaseUser {
  localId: string;
  email: string;
  emailVerified: boolean;
}

async function verifyFirebaseIdToken(idToken: string): Promise<VerifiedFirebaseUser | null> {
  try {
    const res = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${firebaseConfig.apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken }),
      }
    );
    if (!res.ok) return null;
    const data = (await res.json()) as { users?: VerifiedFirebaseUser[] };
    const user = data.users?.[0];
    if (!user || !user.localId) return null;
    return user;
  } catch {
    return null;
  }
}

interface FirestoreValue {
  stringValue?: string;
  integerValue?: string;
  doubleValue?: number;
}

function readFsStr(fields: Record<string, FirestoreValue>, key: string): string {
  return fields[key]?.stringValue || '';
}

function readFsNum(fields: Record<string, FirestoreValue>, key: string): number {
  const v = fields[key];
  if (!v) return 0;
  if (typeof v.doubleValue === 'number') return v.doubleValue;
  if (v.integerValue) return Number(v.integerValue);
  return 0;
}

async function fetchSubscriptionFromFirestore(
  subscriptionId: string,
  idToken: string
): Promise<XtreamAccountRecord | null> {
  const dbId = firebaseConfig.firestoreDatabaseId || '(default)';
  const url = `https://firestore.googleapis.com/v1/projects/${firebaseConfig.projectId}/databases/${dbId}/documents/subscriptions/${encodeURIComponent(subscriptionId)}`;
  try {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${idToken}` },
    });
    if (!res.ok) return null;
    const docData = (await res.json()) as { fields?: Record<string, FirestoreValue> };
    const f = docData.fields;
    if (!f) return null;

    const status = readFsStr(f, 'status') as XtreamAccountRecord['status'];
    return {
      subscriptionId: readFsStr(f, 'id') || subscriptionId,
      userId: readFsStr(f, 'userId'),
      userEmail: readFsStr(f, 'userEmail'),
      userName: readFsStr(f, 'userName'),
      planId: readFsStr(f, 'planId'),
      planName: readFsStr(f, 'planName'),
      durationDays: readFsNum(f, 'durationDays') || 30,
      maxConnections: readFsNum(f, 'maxConnections') || 1,
      status: status || 'pending',
      xtreamUsername: readFsStr(f, 'xtreamUsername'),
      xtreamPassword: readFsStr(f, 'xtreamPassword'),
      activatedAt: readFsStr(f, 'activatedAt') || undefined,
      expiresAt: readFsStr(f, 'expiresAt') || undefined,
      updatedAt: new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

function getBaseUrl(req: express.Request): string {
  const proto = (req.headers['x-forwarded-proto'] as string) || req.protocol || 'https';
  const host = (req.headers['x-forwarded-host'] as string) || req.get('host') || `localhost:${PORT}`;
  return `${proto}://${host}`;
}

function setXtreamCorsHeaders(res: express.Response): void {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', '*');
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true }));

  getPlaylistData().catch((err) => {
    console.warn('Initial M3U preload warning:', err instanceof Error ? err.message : err);
  });

  app.options(['/player_api.php', '/panel_api.php', '/get.php', '/xmltv.php', '/live/*'], (_req, res) => {
    setXtreamCorsHeaders(res);
    res.sendStatus(204);
  });

  app.get('/api/channels', async (req, res) => {
    try {
      const force = req.query.refresh === '1';
      const data = await getPlaylistData(force);
      const publicChannels = data.channels.map((ch) => ({
        streamId: ch.streamId,
        name: ch.name,
        logo: ch.logo,
        group: ch.group,
        categoryId: ch.categoryId,
        chno: ch.chno,
      }));
      res.json({
        total: publicChannels.length,
        updatedAt: data.updatedAt,
        sourceUrl: M3U_SOURCE_URL,
        categories: data.categories,
        channels: publicChannels,
      });
    } catch (error) {
      res.status(502).json({
        error: 'Kanal siyahısı yüklənə bilmədi.',
        details: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  // Direct M3U file download containing real upstream stream URLs for active subscribers (works offline on any player)
  app.get('/api/channels/export-m3u', async (req, res) => {
    const username = String(req.query.username || '').trim();
    const password = String(req.query.password || '').trim();
    const account = findAccountByCredentials(username, password);
    if (!account || !isAccountCurrentlyActive(account)) {
      res.status(403).send('#EXTM3U\n# Abunəlik aktiv deyil.\n');
      return;
    }

    try {
      const data = await getPlaylistData();
      const lines = ['#EXTM3U'];
      for (const ch of data.channels) {
        const attrs = [
          ch.tvgId ? `tvg-id="${ch.tvgId}"` : '',
          ch.logo ? `tvg-logo="${ch.logo}"` : '',
          ch.chno ? `tvg-chno="${ch.chno}"` : '',
          `group-title="${ch.group}"`,
        ]
          .filter(Boolean)
          .join(' ');
        lines.push(`#EXTINF:-1 ${attrs},${ch.name}`);
        lines.push(ch.url);
      }
      res.setHeader('Content-Type', 'audio/x-mpegurl; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="xazarstream_direct_${username}.m3u"`);
      res.send(lines.join('\n'));
    } catch {
      res.status(502).send('M3U faylı hazırlana bilmədi.');
    }
  });

  // Diagnostic check: checks whether the public Shared App URL (ais-pre) is reachable without Google login wall
  app.get('/api/xtream/check-public', async (req, res) => {
    const hostToCheck = String(req.query.host || '').trim();
    const username = String(req.query.username || '').trim();
    const password = String(req.query.password || '').trim();

    if (!hostToCheck) {
      res.status(400).json({ ok: false, error: 'Host tələb olunur.' });
      return;
    }

    try {
      const cleanHost = hostToCheck.replace(/\/+$/, '');
      const testUrl = `${cleanHost}/player_api.php?username=${encodeURIComponent(username)}&password=${encodeURIComponent(password)}`;
      const upstream = await fetch(testUrl, { redirect: 'manual' });
      const contentType = upstream.headers.get('content-type') || '';

      if (upstream.status === 302 || upstream.status === 401 || upstream.status === 403) {
        res.json({
          publicReachable: false,
          status: upstream.status,
          reason: 'auth_wall',
        });
        return;
      }

      if (upstream.status === 404) {
        res.json({
          publicReachable: false,
          status: 404,
          reason: 'not_published',
        });
        return;
      }

      if (upstream.ok && contentType.includes('application/json')) {
        const body = await upstream.json();
        res.json({
          publicReachable: true,
          status: upstream.status,
          body,
        });
        return;
      }

      res.json({
        publicReachable: false,
        status: upstream.status,
        reason: 'unexpected_response',
      });
    } catch (err) {
      res.json({
        publicReachable: false,
        status: 0,
        reason: err instanceof Error ? err.message : 'network_error',
      });
    }
  });

  // Sync Firestore subscription state to Xtream API backend (verifies directly against Firestore!)
  app.post('/api/xtream/sync', async (req, res) => {
    const authHeader = req.headers.authorization || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
    if (!token) {
      res.status(401).json({ error: 'Token tələb olunur.' });
      return;
    }

    const verifiedUser = await verifyFirebaseIdToken(token);
    if (!verifiedUser) {
      res.status(403).json({ error: 'İstifadəçi sessiyası etibarsızdır.' });
      return;
    }

    const payload = req.body as Partial<XtreamAccountRecord>;
    if (!payload.subscriptionId) {
      res.status(400).json({ error: 'Abunəlik ID tələb olunur.' });
      return;
    }

    const store = ensureAccountsStore();
    // Authoritative lookup from Firestore using user's/admin's own verified ID token
    const authoritative = await fetchSubscriptionFromFirestore(payload.subscriptionId, token);
    if (authoritative && authoritative.xtreamUsername && authoritative.xtreamPassword) {
      store[payload.subscriptionId] = authoritative;
      saveAccountsStore(store);
      res.json({ ok: true, status: authoritative.status, source: 'firestore' });
      return;
    }

    const isAdminUser = Boolean(verifiedUser.emailVerified && verifiedUser.email === ADMIN_EMAIL);
    const existing = store[payload.subscriptionId];

    if (!payload.xtreamUsername || !payload.xtreamPassword) {
      res.status(400).json({ error: 'Natamam abunəlik məlumatları.' });
      return;
    }

    if (!isAdminUser) {
      if (payload.userId !== verifiedUser.localId) {
        res.status(403).json({ error: 'Yalnız öz hesabınızı sinxronizasiya edə bilərsiniz.' });
        return;
      }
      store[payload.subscriptionId] = {
        subscriptionId: payload.subscriptionId,
        userId: verifiedUser.localId,
        userEmail: verifiedUser.email,
        userName: String(payload.userName || ''),
        planId: String(payload.planId || ''),
        planName: String(payload.planName || ''),
        durationDays: Number(payload.durationDays || 30),
        maxConnections: Number(payload.maxConnections || 1),
        status: existing?.status || 'pending',
        xtreamUsername: payload.xtreamUsername,
        xtreamPassword: payload.xtreamPassword,
        activatedAt: existing?.activatedAt,
        expiresAt: existing?.expiresAt,
        updatedAt: new Date().toISOString(),
      };
      saveAccountsStore(store);
      res.json({ ok: true, status: store[payload.subscriptionId].status });
      return;
    }

    store[payload.subscriptionId] = {
      subscriptionId: payload.subscriptionId,
      userId: String(payload.userId || existing?.userId || ''),
      userEmail: String(payload.userEmail || existing?.userEmail || ''),
      userName: String(payload.userName || existing?.userName || ''),
      planId: String(payload.planId || existing?.planId || ''),
      planName: String(payload.planName || existing?.planName || ''),
      durationDays: Number(payload.durationDays || existing?.durationDays || 30),
      maxConnections: Number(payload.maxConnections || existing?.maxConnections || 1),
      status: (payload.status as XtreamAccountRecord['status']) || existing?.status || 'pending',
      xtreamUsername: payload.xtreamUsername,
      xtreamPassword: payload.xtreamPassword,
      activatedAt: payload.activatedAt || existing?.activatedAt,
      expiresAt: payload.expiresAt || existing?.expiresAt,
      updatedAt: new Date().toISOString(),
    };
    saveAccountsStore(store);
    res.json({ ok: true, status: store[payload.subscriptionId].status });
  });

  app.post('/api/xtream/sync-batch', async (req, res) => {
    const authHeader = req.headers.authorization || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
    if (!token) {
      res.status(401).json({ error: 'Token tələb olunur.' });
      return;
    }
    const verifiedUser = await verifyFirebaseIdToken(token);
    if (!verifiedUser || !verifiedUser.emailVerified || verifiedUser.email !== ADMIN_EMAIL) {
      res.status(403).json({ error: 'Admin icazəsi tələb olunur.' });
      return;
    }

    const items = (req.body?.items || []) as XtreamAccountRecord[];
    const store = ensureAccountsStore();
    for (const item of items) {
      if (!item.subscriptionId || !item.xtreamUsername || !item.xtreamPassword) continue;
      store[item.subscriptionId] = {
        ...item,
        updatedAt: new Date().toISOString(),
      };
    }
    saveAccountsStore(store);
    res.json({ ok: true, synced: items.length });
  });

  // Real Xtream Codes Player API endpoint (compatible with IPTV Smarters, TiviMate, XCIPTV, Televizo, GSE)
  const handlePlayerApi = async (req: express.Request, res: express.Response) => {
    setXtreamCorsHeaders(res);
    const username = String(req.query.username || req.body?.username || '').trim();
    const password = String(req.query.password || req.body?.password || '').trim();
    const action = String(req.query.action || req.body?.action || '').trim();
    const categoryFilter = String(req.query.category_id || req.body?.category_id || '').trim();

    const account = findAccountByCredentials(username, password);
    if (!account) {
      res.json({ user_info: { auth: 0, message: 'Yanlış istifadəçi adı və ya şifrə.' } });
      return;
    }

    const active = isAccountCurrentlyActive(account);
    if (!active) {
      res.json({
        user_info: {
          auth: 0,
          username: account.xtreamUsername,
          status: account.status === 'pending' ? 'Pending Approval' : 'Disabled',
          message:
            account.status === 'pending'
              ? 'Hesabınız yaradılıb, admin təsdiqindən sonra aktivləşəcək.'
              : 'Abunəlik aktiv deyil və ya müddəti bitib.',
        },
      });
      return;
    }

    const data = await getPlaylistData();

    if (action === 'get_live_categories') {
      res.json(
        data.categories.map((cat) => ({
          category_id: cat.id,
          category_name: cat.name,
          parent_id: 0,
        }))
      );
      return;
    }

    if (action === 'get_live_streams') {
      const filtered = categoryFilter
        ? data.channels.filter((ch) => ch.categoryId === categoryFilter)
        : data.channels;
      res.json(
        filtered.map((ch, idx) => ({
          num: idx + 1,
          name: ch.name,
          stream_type: 'live',
          stream_id: ch.streamId,
          stream_icon: ch.logo,
          epg_channel_id: ch.tvgId || null,
          added: String(Math.floor(Date.now() / 1000)),
          is_adult: ch.group.toUpperCase().includes('ADULT') ? '1' : '0',
          category_id: ch.categoryId,
          custom_sid: '',
          tv_archive: 0,
          direct_source: ch.url,
          tv_archive_duration: 0,
        }))
      );
      return;
    }

    if (
      action === 'get_vod_categories' ||
      action === 'get_vod_streams' ||
      action === 'get_series_categories' ||
      action === 'get_series'
    ) {
      res.json([]);
      return;
    }

    const baseUrl = getBaseUrl(req);
    const parsedUrl = new URL(baseUrl);
    const expUnix = account.expiresAt
      ? String(Math.floor(new Date(account.expiresAt).getTime() / 1000))
      : String(Math.floor(Date.now() / 1000) + account.durationDays * 86400);
    const createdUnix = String(Math.floor(Date.now() / 1000));

    res.json({
      user_info: {
        username: account.xtreamUsername,
        password: account.xtreamPassword,
        message: 'XəzərStream IPTV aktivdir',
        auth: 1,
        status: 'Active',
        exp_date: expUnix,
        is_trial: '0',
        active_cons: '0',
        created_at: createdUnix,
        max_connections: String(account.maxConnections),
        allowed_output_formats: ['m3u8', 'ts'],
      },
      server_info: {
        url: parsedUrl.hostname,
        port: parsedUrl.port || (parsedUrl.protocol === 'https:' ? '443' : '80'),
        https_port: parsedUrl.port || '443',
        server_protocol: parsedUrl.protocol.replace(':', ''),
        rtmp_port: '1935',
        timezone: 'Asia/Baku',
        timestamp_now: Math.floor(Date.now() / 1000),
        time_now: new Date().toISOString().replace('T', ' ').slice(0, 19),
      },
    });
  };

  app.get('/player_api.php', handlePlayerApi);
  app.post('/player_api.php', handlePlayerApi);
  app.get('/panel_api.php', handlePlayerApi);
  app.post('/panel_api.php', handlePlayerApi);

  app.get('/xmltv.php', (_req, res) => {
    setXtreamCorsHeaders(res);
    res.setHeader('Content-Type', 'application/xml; charset=utf-8');
    res.send('<?xml version="1.0" encoding="UTF-8"?><tv generator-info-name="XazarStream"></tv>');
  });

  // Real M3U Plus playlist endpoint for Xtream Codes players & VLC
  app.get('/get.php', async (req, res) => {
    setXtreamCorsHeaders(res);
    const username = String(req.query.username || '').trim();
    const password = String(req.query.password || '').trim();

    const account = findAccountByCredentials(username, password);
    if (!account || !isAccountCurrentlyActive(account)) {
      res.status(403).send('#EXTM3U\n# Hesab aktiv deyil və ya admin təsdiqi gözlənilir.\n');
      return;
    }

    try {
      const data = await getPlaylistData();
      const lines = ['#EXTM3U'];
      for (const ch of data.channels) {
        const attrs = [
          ch.tvgId ? `tvg-id="${ch.tvgId}"` : '',
          ch.logo ? `tvg-logo="${ch.logo}"` : '',
          ch.chno ? `tvg-chno="${ch.chno}"` : '',
          `group-title="${ch.group}"`,
        ]
          .filter(Boolean)
          .join(' ');
        lines.push(`#EXTINF:-1 ${attrs},${ch.name}`);
        lines.push(ch.url);
      }
      res.setHeader('Content-Type', 'audio/x-mpegurl; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="xazarstream_${username}.m3u"`);
      res.send(lines.join('\n'));
    } catch {
      res.status(502).send('Playlist hazırlana bilmədi.');
    }
  });

  const handleLiveStream = async (req: express.Request, res: express.Response) => {
    setXtreamCorsHeaders(res);
    const { username, password, streamParam } = req.params;
    const account = findAccountByCredentials(username, password);
    if (!account || !isAccountCurrentlyActive(account)) {
      res.status(403).json({ error: 'Abunəlik aktiv deyil.' });
      return;
    }
    const streamId = Number(streamParam.replace(/\.(m3u8|ts)$/i, ''));
    if (Number.isNaN(streamId)) {
      res.status(404).json({ error: 'Yanlış kanal ID.' });
      return;
    }
    const data = await getPlaylistData();
    const channel = data.channels.find((ch) => ch.streamId === streamId);
    if (!channel) {
      res.status(404).json({ error: 'Kanal tapılmadı.' });
      return;
    }
    res.redirect(302, channel.url);
  };

  app.get('/live/:username/:password/:streamParam', handleLiveStream);
  app.get('/:username/:password/:streamParam([0-9]+(?:\\.(?:m3u8|ts))?)', handleLiveStream);

  // Authenticated stream resolver for active subscribers (returns direct HTTPS + fallback proxy URL)
  app.get('/api/channel-stream', async (req, res) => {
    const username = String(req.query.username || '').trim();
    const password = String(req.query.password || '').trim();
    const streamId = Number(req.query.streamId || 0);

    const account = findAccountByCredentials(username, password);
    if (!account || !isAccountCurrentlyActive(account)) {
      res.status(403).json({ error: 'Yayımı izləmək üçün aktiv abunəlik tələb olunur.' });
      return;
    }

    try {
      const data = await getPlaylistData();
      const channel = data.channels.find((c) => c.streamId === streamId);
      if (!channel) {
        res.status(404).json({ error: 'Kanal tapılmadı.' });
        return;
      }
      const httpsUrl = channel.url.replace(/^http:\/\//i, 'https://');
      const proxyUrl = `/api/hls-proxy?username=${encodeURIComponent(username)}&password=${encodeURIComponent(password)}&streamId=${channel.streamId}`;
      res.json({
        streamId: channel.streamId,
        name: channel.name,
        group: channel.group,
        url: channel.url,
        httpsUrl,
        proxyUrl,
      });
    } catch {
      res.status(502).json({ error: 'Kanal məlumatı alına bilmədi.' });
    }
  });

  // HTTPS-safe HLS proxy for in-browser active subscriber player
  app.get('/api/hls-proxy', async (req, res) => {
    const username = String(req.query.username || '').trim();
    const password = String(req.query.password || '').trim();
    const targetUrl = String(req.query.url || '').trim();
    const streamIdParam = req.query.streamId ? Number(req.query.streamId) : null;

    const account = findAccountByCredentials(username, password);
    if (!account || !isAccountCurrentlyActive(account)) {
      res.status(403).json({ error: 'Yayımı izləmək üçün aktiv abunəlik tələb olunur.' });
      return;
    }

    let upstreamUrl = targetUrl;
    if (streamIdParam) {
      const data = await getPlaylistData();
      const ch = data.channels.find((c) => c.streamId === streamIdParam);
      if (!ch) {
        res.status(404).json({ error: 'Kanal tapılmadı.' });
        return;
      }
      upstreamUrl = ch.url;
    }

    if (!upstreamUrl || !/^https?:\/\//i.test(upstreamUrl)) {
      res.status(400).json({ error: 'Keçərli yayım ünvanı yoxdur.' });
      return;
    }

    try {
      const upstreamRes = await fetch(upstreamUrl, {
        headers: { 'User-Agent': 'VLC/3.0.18 LibVLC/3.0.18' },
      });
      if (!upstreamRes.ok) {
        res.status(upstreamRes.status).send('Yayım mənbəyi cavab vermir.');
        return;
      }

      const contentType = upstreamRes.headers.get('content-type') || '';
      const isPlaylist =
        upstreamUrl.includes('.m3u8') ||
        contentType.includes('mpegurl') ||
        contentType.includes('x-mpegURL');

      if (isPlaylist) {
        const text = await upstreamRes.text();
        const resolvedBase = new URL(upstreamRes.url || upstreamUrl);
        const rewritten = text
          .split('\n')
          .map((line) => {
            const trimmed = line.trim();
            if (!trimmed || trimmed.startsWith('#')) {
              return line;
            }
            try {
              const abs = new URL(trimmed, resolvedBase).toString();
              return `/api/hls-proxy?username=${encodeURIComponent(username)}&password=${encodeURIComponent(password)}&url=${encodeURIComponent(abs)}`;
            } catch {
              return line;
            }
          })
          .join('\n');

        res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.send(rewritten);
        return;
      }

      res.setHeader('Content-Type', contentType || 'video/mp2t');
      res.setHeader('Access-Control-Allow-Origin', '*');
      const arrayBuf = await upstreamRes.arrayBuffer();
      res.send(Buffer.from(arrayBuf));
    } catch (error) {
      res.status(502).json({
        error: 'Yayım proksisi xətası.',
        details: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`XəzərStream IPTV server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
