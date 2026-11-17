import { CategoryItem, ChannelItem } from '../types/iptv';

export const M3U_SOURCE_URL =
  'https://raw.githubusercontent.com/camalmanafov022-blip/Yeni/refs/heads/main/azer.m3u';

export interface ParsedChannelWithUrl extends ChannelItem {
  url?: string;
}

export function parseM3UClient(rawText: string): {
  channels: ParsedChannelWithUrl[];
  categories: CategoryItem[];
} {
  const parts = rawText.split('#EXTINF:');
  const channels: ParsedChannelWithUrl[] = [];
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

export async function fetchChannelsWithFallback(): Promise<{
  channels: ParsedChannelWithUrl[];
  categories: CategoryItem[];
}> {
  try {
    const apiRes = await fetch('/api/channels');
    const contentType = apiRes.headers.get('content-type') || '';
    if (apiRes.ok && contentType.includes('application/json')) {
      const data = (await apiRes.json()) as {
        channels: ParsedChannelWithUrl[];
        categories: CategoryItem[];
      };
      if (Array.isArray(data.channels) && data.channels.length > 0) {
        return data;
      }
    }
  } catch {
    // Fallback to direct GitHub raw M3U fetch when deployed statically (e.g. GitHub Pages)
  }

  const rawRes = await fetch(M3U_SOURCE_URL);
  if (!rawRes.ok) {
    throw new Error('Kanal siyahısı yüklənə bilmədi.');
  }
  const text = await rawRes.text();
  return parseM3UClient(text);
}

export async function downloadDirectM3uFile(username: string): Promise<void> {
  const rawRes = await fetch(M3U_SOURCE_URL);
  if (!rawRes.ok) {
    throw new Error('M3U mənbəyi yüklənə bilmədi.');
  }
  const text = await rawRes.text();
  const { channels } = parseM3UClient(text);
  const lines = ['#EXTM3U'];
  for (const ch of channels) {
    if (!ch.url) continue;
    const attrs = [
      ch.logo ? `tvg-logo="${ch.logo}"` : '',
      ch.chno ? `tvg-chno="${ch.chno}"` : '',
      `group-title="${ch.group}"`,
    ]
      .filter(Boolean)
      .join(' ');
    lines.push(`#EXTINF:-1 ${attrs},${ch.name}`);
    lines.push(ch.url);
  }
  const blob = new Blob([lines.join('\n')], { type: 'audio/x-mpegurl;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `xazarstream_${username}.m3u`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
