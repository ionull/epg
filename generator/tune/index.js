const https = require('https');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

// 配置信息
const RADIO_ID = '420730';
const OUTPUT_DIR = path.join(__dirname, '../../parts');
const OUTPUT_FILE = path.join(OUTPUT_DIR, 'sing-tao-yue.xml.gz');
// 注意：mytuner 的 API 通常需要当前的毫秒级时间戳，原脚本中的 time 建议动态获取
const time = 1772382589583; 

const API_URL = `https://metadata-api.mytuner.mobi/api/v1/metadata-api/web/song-history?app_codename=mytuner_website&radio_id=${RADIO_ID}&time=${time}`;

const HEADERS = {
    'accept': '*/*',
    'accept-language': 'en-US,en;q=0.9',
    'authorization': 'HMAC mytuner_website:3L__zOstK96ssn3RcrGQ9rlxgPhr90gUYM2GZUU0nnE',
    'content-type': 'application/json',
    'origin': 'https://mytuner-radio.com',
    'referer': 'https://mytuner-radio.com/',
    'sec-ch-ua': '"Chromium";v="142", "Opera Air";v="126", "Not_A Brand";v="99"',
    'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36 OPR/126.0.0.0'
};

function fetchData(url) {
    return new Promise((resolve, reject) => {
        https.get(url, { headers: HEADERS }, (res) => {
            let data = '';
            res.on('data', (chunk) => data += chunk);
            res.on('end', () => {
                if (res.statusCode >= 200 && res.statusCode < 300) {
                    try {
                        resolve(JSON.parse(data).song_history);
                    } catch (e) {
                        reject(new Error('Failed to parse JSON'));
                    }
                } else {
                    reject(new Error(`Request failed with status ${res.statusCode}`));
                }
            });
        }).on('error', reject);
    });
}

/**
 * 格式化时间为 XMLTV: YYYYMMDDHHmmss +0800
 */
function formatDate(timestamp) {
    // 1. 将原始 UTC 时间戳增加 8 小时 (8 * 3600 秒)
    // 这样 getUTC... 方法获取到的就是北京时间（+8）的数值
    const date = new Date((timestamp + (8 * 3600)) * 1000);
    
    const pad = (num) => num.toString().padStart(2, '0');
    
    const YYYY = date.getUTCFullYear();
    const MM = pad(date.getUTCMonth() + 1);
    const DD = pad(date.getUTCDate());
    const HH = pad(date.getUTCHours());
    const mm = pad(date.getUTCMinutes());
    const ss = pad(date.getUTCSeconds());

    // 2. 后缀改为 +0800
    return `${YYYY}${MM}${DD}${HH}${mm}${ss} +0800`;
}

function escapeXml(unsafe) {
    if (!unsafe) return '';
    return unsafe.replace(/[<>&"']/g, (c) => {
        switch (c) {
            case '<': return '&lt;';
            case '>': return '&gt;';
            case '&': return '&amp;';
            case '"': return '&quot;';
            case "'": return '&apos;';
            default: return c;
        }
    });
}

async function run() {
    try {
        console.log('Fetching data from MyTuner...');
        const songs = await fetchData(API_URL);

        if (!Array.isArray(songs) || songs.length === 0) {
            console.log('No data found.');
            return;
        }

        let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
        xml += '<tv>\n';
        xml += `  <channel id="SingTaoYue">\n`;
        xml += `    <display-name>星岛粤语</display-name>\n`;
        xml += '  </channel>\n';

        songs.forEach((song, index) => {
            const startStr = formatDate(song.start_date);
            let stopTimestamp;
            if (index < songs.length - 1) {
                // Use the start time of the NEXT item in the array as the stop time
                stopTimestamp = songs[index + 1].start_date;
            } else {
                // For the very last (newest) item, we add 5 minutes (300s) as a buffer
                stopTimestamp = song.start_date + 300;
            }
            const stopStr = formatDate(stopTimestamp);

            xml += `  <programme start="${startStr}" stop="${stopStr}" channel="SingTaoYue">\n`;
            xml += `    <title lang="zh">${escapeXml(song.metadata)}</title>\n`;
            if (song.artwork_url_large) {
                xml += `    <icon src="${escapeXml(song.artwork_url_large)}" />\n`;
            }
            xml += '  </programme>\n';
        });

        xml += '</tv>';

        if (!fs.existsSync(OUTPUT_DIR)) {
            fs.mkdirSync(OUTPUT_DIR, { recursive: true });
        }

        const compressed = zlib.gzipSync(Buffer.from(xml, 'utf-8'));
        fs.writeFileSync(OUTPUT_FILE, compressed);
        console.log(`Success! Saved to ${OUTPUT_FILE} with Timezone +0800`);

    } catch (err) {
        console.error('Error:', err.message);
        process.exit(1);
    }
}

run();
