const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

async function fetchEPG() {
    // 获取北京时间 (UTC+8) 的日期 YYYYMMDD
    const now = new Date(new Date().getTime() + 8 * 3600000);
    const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '');
    
    const channels = [
        { id: '110', name: '浙江国际' },
        { id: '112', name: '之江纪录' },
        { id: '108', name: '浙江少儿' },
        { id: '107', name: '浙江新闻' },
        { id: '106', name: '浙江民生休闲' },
        { id: '103', name: '浙江经济生活' },
        { id: '104', name: '浙江教科影视' },
        { id: '102', name: '钱江都市' },
        { id: '101', name: '浙江卫视' },
    ];

    let xmlContent = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE tv SYSTEM "xmltv.dtd">
<tv generator-info-name="CZTV EPG Generator">`;

    // 生成频道定义
    channels.forEach(ch => {
        xmlContent += `
  <channel id="${ch.name}">
    <display-name lang="zh">${ch.name}</display-name>
  </channel>`;
    });

    for (const ch of channels) {
        const url = `https://p.cztv.com/api/paas/program/${ch.id}/${dateStr}`;
        try {
            const response = await fetch(url);
            const data = await response.json();
            
            // 响应结构: data.content.list[0].list
            const programList = data?.content?.list?.[0]?.list || [];
            
            programList.forEach((item, index) => {
                const startMs = parseInt(item.play_time);
                let stopMs;

                // 如果有下一条，用下一条的开始时间作为当前停止时间
                if (index < programList.length - 1) {
                    stopMs = parseInt(programList[index + 1].play_time);
                } else {
                    // 最后一条用 duration 计算
                    stopMs = startMs + parseInt(item.duration || 0);
                }

                xmlContent += `
  <programme start="${formatXmltvTime(startMs)}" stop="${formatXmltvTime(stopMs)}" channel="${ch.name}">
    <title lang="zh">${escapeXml(item.program_title)}</title>
  </programme>`;
            });
        } catch (error) {
            console.error(`Error fetching channel ${ch.id}:`, error.message);
        }
    }

    xmlContent += '\n</tv>';

    // 确保目录存在
    const outputDir = path.join(__dirname, '../../parts');
    if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

    // Gzip 压缩并保存
    const compressed = zlib.gzipSync(xmlContent);
    fs.writeFileSync(path.join(outputDir, 'zsj.xml.gz'), compressed);
    console.log('EPG generated successfully at parts/zsj.xml.gz');
}

// 格式化时间为 XMLTV 格式: YYYYMMDDHHmmSS +0800
function formatXmltvTime(ms) {
    const d = new Date(ms);
    const pad = (n) => n.toString().padStart(2, '0');
    const Y = d.getUTCFullYear();
    const M = pad(d.getUTCMonth() + 1);
    const D = pad(d.getUTCDate());
    const h = pad(d.getUTCHours() + 8); // 手动转+8区显示，或者用Date对象转换
    // 注意：如果是北京时间API，通常play_time已经是对应绝对时间。
    // 简单处理：直接用 Date 的本地时间方法（Runner 默认 UTC，所以需偏移）
    const tzDate = new Date(ms + 8 * 3600000);
    const format = (date) => 
        date.getUTCFullYear() +
        pad(date.getUTCMonth() + 1) +
        pad(date.getUTCDate()) +
        pad(date.getUTCHours()) +
        pad(date.getUTCMinutes()) +
        pad(date.getUTCSeconds());
    
    return `${format(tzDate)} +0800`;
}

function escapeXml(unsafe) {
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

fetchEPG();
