const fs = require('fs');
const axios = require('axios');
const cheerio = require('cheerio');
const dayjs = require('dayjs');
const utc = require('dayjs/plugin/utc');
const timezone = require('dayjs/plugin/timezone');
dayjs.extend(utc);
dayjs.extend(timezone);

const URL = 'http://macaulotustv.cc/en/programme';
const CHANNEL_ID = '莲花卫视';
const TZ = 'Asia/Shanghai';
const OUTPUT_FILE = process.env.OUTPUT || 'epg.xml';

(async () => {
  const res = await axios.get(URL);
  const $ = cheerio.load(res.data);

  const days = $('#programmeContent .programme-content');
  const baseMon = dayjs().tz(TZ).startOf('week').add(1, 'day');

  const xml = [
    '<?xml version="1.0" encoding="utf-8"?>',
    '<tv>',
    `  <channel id="${CHANNEL_ID}">`,
    '    <display-name lang="cn">莲花卫视</display-name>',
    '    <icon src="https://macaulotustv.cc/favicon.ico" />',
    '  </channel>'
  ];

  days.each((dayIndex, dayElem) => {
    const items = $(dayElem).find('.item');
    items.each((i, item) => {
      const timeText = $(item).find('.time').text().trim();
      const [h, m] = timeText.split(':').map(Number);
      const titleParts = $(item).find('.name span').map((_, el) => $(el).text().trim()).get();
      const title = titleParts.join(' - ').replace(/&/g, '&amp;');
      const start = baseMon.add(dayIndex, 'day').hour(h).minute(m);
      const stop = i + 1 < items.length
        ? baseMon.add(dayIndex, 'day').hour(...$(items[i + 1]).find('.time').text().trim().split(':').map(Number))
        : start.add(1, 'hour');

      const f = dt => dt.format('YYYYMMDDHHmmss ZZ');

      xml.push(`  <programme start="${f(start)}" stop="${f(stop)}" channel="${CHANNEL_ID}">`);
      xml.push(`    <title lang="en">${title}</title>`);
      xml.push('  </programme>');
    });
  });

  xml.push('</tv>');
  fs.writeFileSync(OUTPUT_FILE, xml.join('\n'), 'utf8');
  console.log(`✅ EPG written to ${OUTPUT_FILE}`);
})();
