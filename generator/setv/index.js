const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

// 配置信息
const API_URL = 'https://api.setv.sh.cn/getLatestEPG';
const OUTPUT_PATH = path.join(__dirname, '../../parts/setv.xml.gz');
const CHANNEL_NAME = '上海教育电视台';
const CHANNEL_ID = '上海教育电视台';

/**
 * 转义 XML 特殊字符，防止生成的 XML 格式错误
 */
function escapeXml(unsafe) {
    if (!unsafe) return '';
    return unsafe.replace(/[<>&'"]/g, (c) => {
        switch (c) {
            case '<': return '&lt;';
            case '>': return '&gt;';
            case '&': return '&amp;';
            case '\'': return '&apos;';
            case '"': return '&quot;';
        }
    });
}

/**
 * 将时间戳转换为 XMLTV 格式: YYYYMMDDHHMMSS +0800
 */
function formatXMLTVDate(timestamp) {
    const date = new Date(timestamp * 1000);
    const pad = (n) => n.toString().padStart(2, '0');
    
    const Y = date.getFullYear();
    const M = pad(date.getMonth() + 1);
    const D = pad(date.getDate());
    const h = pad(date.getHours());
    const m = pad(date.getMinutes());
    const s = pad(date.getSeconds());
    
    return `${Y}${M}${D}${h}${m}${s} +0000`;
}

async function run() {
    try {
        console.log('正在获取 EPG 数据...');
        const response = await fetch(API_URL);
        
        if (!response.ok) throw new Error(`HTTP 错误: ${response.status}`);
        
        const json = await response.json();
        if (json.result !== 'success' || !Array.isArray(json.data)) {
            throw new Error('API 数据格式不正确');
        }

        const data = json.data;

        // 1. 构建 XML 字符串
        let xml = `<?xml version="1.0" encoding="UTF-8"?>\n`;
        xml += `<tv generator-info-name="NodeJS-Native-EPG">\n`;
        xml += `  <channel id="${escapeXml(CHANNEL_ID)}">\n`;
        xml += `    <display-name>${escapeXml(CHANNEL_NAME)}</display-name>\n`;
        xml += `  </channel>\n`;

        data.forEach((item, index) => {
            const startTime = item.time;
            // 结束时间通常为下一条的开始时间，最后一条默认增加 1 小时
            const stopTime = (index < data.length - 1) ? data[index + 1].time : startTime + 3600;

            xml += `  <programme start="${formatXMLTVDate(startTime)}" stop="${formatXMLTVDate(stopTime)}" channel="${escapeXml(CHANNEL_ID)}">\n`;
            xml += `    <title lang="zh">${escapeXml(item.title)}</title>\n`;
            xml += `  </programme>\n`;
        });

        xml += `</tv>`;

        // 2. 确保存储目录存在
        const dir = path.dirname(OUTPUT_PATH);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }

        // 3. Gzip 压缩并保存
        const compressed = zlib.gzipSync(Buffer.from(xml, 'utf-8'));
        fs.writeFileSync(OUTPUT_PATH, compressed);

        console.log(`处理完成！\n文件已保存至: ${OUTPUT_PATH}\n文件大小: ${compressed.length} bytes`);

    } catch (error) {
        console.error('执行失败:', error.message);
        process.exit(1);
    }
}

run();
