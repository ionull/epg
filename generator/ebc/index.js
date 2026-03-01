const axios = require('axios');
const cheerio = require('cheerio');
const dayjs = require('dayjs');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { promisify } = require('util');

const gzip = promisify(zlib.gzip);

// Fix for "ReferenceError: File is not defined" in some Node environments
if (typeof File === 'undefined') {
    global.File = class { constructor() { } };
}

const TARGET_URL = 'https://ebcasiatv.com/asia/apps/showlist_UV.htm';
const OUTPUT_PATH = path.join(__dirname, '../../parts/ebc_asia.xml.gz');
const CHANNEL_ID = 'ebc.asia';
const CHANNEL_NAME = '東森亞洲衛視';

function escapeXml(unsafe) {
    if (!unsafe) return '';
    return unsafe.replace(/[<>&"']/g, (c) => {
        switch (c) {
            case '<': return '&lt;';
            case '>': return '&gt;';
            case '&': return '&amp;';
            case '"': return '&quot;';
            case "'": return '&apos;';
        }
    });
}

async function generateEpg() {
    try {
        console.log(`Fetching data from: ${TARGET_URL}`);
        
        // Fetch with headers to mimic a browser
        const { data: html } = await axios.get(TARGET_URL, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            },
            responseType: 'text'
        });

        const $ = cheerio.load(html);
        const programs = [];

        // EBC site uses specific day classes: showlist-first-day, showlist-sec-day, etc.
        const dayContainers = $("div[class$='-day']");
        
        dayContainers.each((_, dayElem) => {
            const dateDiv = $(dayElem).find("div[class*='showlist-date']");
            if (dateDiv.length === 0) return;

            // Extract "2026.02.07" from text like "2026.02.07　星期六"
            const rawDateText = dateDiv.text().trim();
            const dateMatch = rawDateText.match(/(\d{4}\.\d{2}\.\d{2})/);
            if (!dateMatch) return;
            
            const baseDate = dayjs(dateMatch[1], 'YYYY.MM.DD');

            const showBox = $(dayElem).find('.showlist-show');
            // The times and titles are separated by <br /> tags
            const rawContent = showBox.html() || '';
            const lines = rawContent.split(/<br\s*\/?>/i);

            lines.forEach(line => {
                // Remove HTML tags, &nbsp; and trim
                const cleanLine = line.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, '').trim();
                
                // Expecting format: "06:00　Program Title"
                if (!cleanLine || !cleanLine.includes('　')) return;

                const parts = cleanLine.split('　');
                const timePart = parts[0].trim();
                const titlePart = parts.slice(1).join('　').trim();

                if (!/^\d{2}:\d{2}$/.test(timePart)) return;

                const [hour, minute] = timePart.split(':').map(Number);
                let progStart = baseDate.hour(hour).minute(minute).second(0);

                // Logic: Broadcast days often list shows past midnight (00:00-05:59)
                // in the same block as the previous day. Move these to the next calendar day.
                if (hour < 6) {
                    progStart = progStart.add(1, 'day');
                }

                programs.push({
                    start: progStart,
                    title: escapeXml(titlePart)
                });
            });
        });

        if (programs.length === 0) {
            throw new Error('No programs parsed. The website structure might have changed.');
        }

        // Sort by time
        programs.sort((a, b) => a.start.unix() - b.start.unix());

        // Build XMLTV
        let xml = `<?xml version="1.0" encoding="UTF-8"?>\n`;
        xml += `<tv generator-info-name="NodeEPG">\n`;
        xml += `  <channel id="${CHANNEL_ID}">\n`;
        xml += `    <display-name lang="zh">${CHANNEL_NAME}</display-name>\n`;
        xml += `  </channel>\n`;

        for (let i = 0; i < programs.length; i++) {
            const prog = programs[i];
            const startTime = prog.start.format('YYYYMMDDHHmmss +0800');
            
            let endTime;
            if (i < programs.length - 1) {
                // End time is start of next show
                endTime = programs[i + 1].start.format('YYYYMMDDHHmmss +0800');
            } else {
                // Last show of the week defaults to +1 hour
                endTime = prog.start.add(1, 'hour').format('YYYYMMDDHHmmss +0800');
            }

            xml += `  <programme start="${startTime}" stop="${endTime}" channel="${CHANNEL_ID}">\n`;
            xml += `    <title lang="zh">${prog.title}</title>\n`;
            xml += `  </programme>\n`;
        }

        xml += `</tv>`;

        // Ensure directory exists
        const dir = path.dirname(OUTPUT_PATH);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }

        // Compress and Save
        const compressed = await gzip(xml);
        fs.writeFileSync(OUTPUT_PATH, compressed);

        console.log(`Success! EPG saved to: ${OUTPUT_PATH}`);
        console.log(`Total programs processed: ${programs.length}`);

    } catch (error) {
        console.error('Failed to generate EPG:', error.message);
        if (error.response) {
            console.error('Status:', error.response.status);
        }
    }
}

generateEpg();