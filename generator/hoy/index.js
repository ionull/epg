import fs from 'fs';
import zlib from 'zlib';
import path from 'path';
import { XMLParser } from 'fast-xml-parser';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc.js';
import timezone from 'dayjs/plugin/timezone.js';
import fetch from 'node-fetch';

dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.tz.setDefault('Asia/Shanghai');

// 🟦 Channels to fetch
const channelList = [76, 77, 78];
const OUTPUT_PATH = path.resolve('../../parts/hoy.xml.gz');

async function fetchEpg(channelId, dateStr) {
  const url = `https://epg-file.hoy.tv/hoy/OTT${channelId}${dateStr}.xml`;
  console.log(`Fetching: ${url}`);

  const res = await fetch(url);
  if (!res.ok) {
    console.warn(`⚠️ Failed to fetch channel ${channelId}: ${res.status}`);
    return null;
  }

  const xml = await res.text();
  const parser = new XMLParser({ ignoreAttributes: false });
  const data = parser.parse(xml);
  const channel = data?.ProgramGuide?.Channel;

  if (!channel) {
    console.warn(`⚠️ Channel ${channelId} has no EPG data`);
    return null;
  }

  const epgItems = Array.isArray(channel.EpgItem)
    ? channel.EpgItem
    : [channel.EpgItem];

  return epgItems;
}

async function main() {
  const now = dayjs().tz();
  const dateStr = now.format('YYYYMMDD');
  const minTime = now.subtract(1, 'day');
  const maxTime = now.add(3, 'day');

  let output = `<?xml version="1.0" encoding="UTF-8"?>\n`;
  output += `<tv generator-info-name="epg-generator-hoy">\n`;

  // Channel metadata
  for (const channelId of channelList) {
    output += `  <channel id="${channelId}"><display-name>HOY${channelId}</display-name></channel>\n`;
  }

  // Programme listings
  for (const channelId of channelList) {
    const epgItems = await fetchEpg(channelId, dateStr);
    if (!epgItems) continue;

    for (const item of epgItems) {
      const startStr = item.EpgStartDateTime?.replace(' ', 'T');
      const stopStr = item.EpgEndDateTime?.replace(' ', 'T');
      const start = dayjs.tz(startStr, 'Asia/Shanghai');
      const stop = dayjs.tz(stopStr, 'Asia/Shanghai');

      // 🟨 Skip if outside the desired range
      if (stop.isBefore(minTime) || start.isAfter(maxTime)) continue;

      const title = item.ComScore?.ns_st_pr?.trim() ?? '';
      const desc = item.EpisodeInfo?.EpisodeLongDescription?.trim() ?? '';
      const icon = item.ProgramInfo?.ProgramThumbnailUrl ?? '';

      output += `  <programme start="${start.format('YYYYMMDDHHmmss')} +0800" stop="${stop.format('YYYYMMDDHHmmss')} +0800" channel="${channelId}">\n`;
      output += `    <title lang="zh">${escapeXml(title)}</title>\n`;
      if (desc) output += `    <desc lang="zh">${escapeXml(desc)}</desc>\n`;
      if (icon) output += `    <icon src="${icon}"/>\n`;
      output += `  </programme>\n`;
    }
  }

  output += `</tv>`;

  fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
  const gz = zlib.gzipSync(output);
  fs.writeFileSync(OUTPUT_PATH, gz);
  console.log(`✅ EPG saved to ${OUTPUT_PATH}`);
}

function escapeXml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

main().catch(err => {
  console.error('❌ Error generating EPG:', err);
  process.exit(1);
});
