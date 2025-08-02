const axios = require('axios');
const cheerio = require('cheerio');
const dayjs = require('dayjs');
const utc = require('dayjs/plugin/utc');
const timezone = require('dayjs/plugin/timezone');
const https = require('https');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

dayjs.extend(utc);
dayjs.extend(timezone);

const URL = 'https://lotustv.mo/en/programme';
const CHANNEL_ID = '莲花卫视';
const DISPLAY_NAME = '澳门莲花';
const TZ = 'Asia/Shanghai';

// Output file path from env or default to gzipped file in root parts folder
const OUTPUT_FILE = process.env.OUTPUT || path.resolve('../parts/macaulotus.xml.gz');

// Ensure output directory exists
const outputDir = path.dirname(OUTPUT_FILE);
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

// HTTPS agent ignoring SSL errors if needed
const httpsAgent = new https.Agent({ rejectUnauthorized: true });

(async () => {
  try {
    const res = await axios.get(URL, { httpsAgent });
    const $ = cheerio.load(res.data);

    const days = $('#programmeContent .programme-content');
    
    const now = dayjs().tz(TZ);
    // Get this week's Monday (even if today is Sunday)
    const baseMon = now.day() === 0
      ? now.subtract(6, 'day').startOf('day') // if today is Sunday, subtract 6 to get Monday
      : now.startOf('week').add(1, 'day');    // else use normal Monday

    const xml = [
      '<?xml version="1.0" encoding="utf-8"?>',
      '<tv>',
      `  <channel id="${CHANNEL_ID}">`,
      `    <display-name lang="zh-CN">${DISPLAY_NAME}</display-name>`,
      '    <icon src="https://macaulotustv.cc/favicon.ico" />',
      '  </channel>',
    ];

    days.each((dayIndex, dayElem) => {
      const items = $(dayElem).find('.item');
      items.each((i, item) => {
        const timeText = $(item).find('.time').text().trim();
        const [h, m] = timeText.split(':').map(Number);
        const titleParts = $(item).find('.name span').map((_, el) => $(el).text().trim()).get();
        const title = titleParts.join(' - ').replace(/&/g, '&amp;');
        const start = baseMon.add(dayIndex, 'day').hour(h).minute(m);

        if (i + 1 < items.length) {
          // Use next time in same day
          const nextTimeText = $(items[i + 1]).find('.time').text().trim();
          const [nextH, nextM] = nextTimeText.split(':').map(Number);
          stop = baseMon.add(dayIndex, 'day').hour(nextH).minute(nextM);
        } else {
          // Try first item from next day
          const nextDay = $(days[dayIndex + 1]);
          const nextItems = nextDay.find('.item');
          if (nextItems.length > 0) {
            const nextTimeText = nextItems.first().find('.time').text().trim();
            const [nextH, nextM] = nextTimeText.split(':').map(Number);
            stop = baseMon.add(dayIndex + 1, 'day').hour(nextH).minute(nextM);
          } else {
            // Fallback
            stop = start.add(1, 'hour');
          }
        }

        const f = dt => dt.format('YYYYMMDDHHmmss ZZ');

        xml.push(`  <programme start="${f(start)}" stop="${f(stop)}" channel="${CHANNEL_ID}">`);
        xml.push(`    <title lang="zh-CN">${title}</title>`);
        xml.push('  </programme>');
      });
    });

    xml.push('</tv>');

    const xmlString = xml.join('\n');

    // Compress and save as .gz
    const gzip = zlib.gzipSync(xmlString);
    fs.writeFileSync(OUTPUT_FILE, gzip);

    console.log(`✅ Gzipped EPG XML written to ${OUTPUT_FILE}`);

  } catch (error) {
    console.error('❌ Failed to fetch or generate EPG:', error);
    process.exit(1);
  }
})();
