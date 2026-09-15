const https = require('https');
const zlib = require('zlib');
const fs = require('fs').promises;
const path = require('path');
const { promisify } = require('util');

const gzipAsync = promisify(zlib.gzip);

// 3 个频道的配置信息
const CHANNELS = [
  {
    id: "f7f48462-9b13-485b-8101-7b54716411ec",
    tvgId: "鳳凰衛視中文台",
    name: "凤凰中文"
  },
  {
    id: "7c96b084-60e1-40a9-89c5-682b994fb680",
    tvgId: "鳳凰衛視資訊台",
    name: "凤凰资讯"
  },
  {
    id: "15e02d92-1698-416c-af2f-3e9a872b4d78",
    tvgId: "鳳凰衛視香港台",
    name: "凤凰香港"
  }
];

// 获取北京时间（UTC+8）下的日期字符串 YYYYMMDD，并支持天数偏移
function getBeijingDateStr(offsetDays = 0) {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  
  const formatter = new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
  
  const parts = formatter.formatToParts(d);
  const year = parts.find(p => p.type === 'year').value;
  const month = parts.find(p => p.type === 'month').value;
  const day = parts.find(p => p.type === 'day').value;
  return `${year}${month}${day}`;
}

// 封装原生 HTTPS 请求
function fetchJson(url) {
  return new Promise((resolve, reject) => {
    https.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    }, (res) => {
      if (res.statusCode !== 200) {
        reject(new Error(`HTTP 状态码错误: ${res.statusCode}`));
        res.resume();
        return;
      }
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(new Error(`解析 JSON 失败: ${e.message}`));
        }
      });
    }).on('error', (err) => {
      reject(err);
    });
  });
}

// XML 特殊字符转义
function escapeXml(unsafe) {
  if (!unsafe) return '';
  return unsafe.replace(/[<>&'"]/g, (c) => {
    switch (c) {
      case '<': return '&lt;';
      case '>': return '&gt;';
      case '&': return '&amp;';
      case '\'': return '&apos;';
      case '"': return '&quot;';
      default: return c;
    }
  });
}

// 将 Date 对象格式化为 XMLTV 标准格式 (YYYYMMDDHHmmss +0000)
function formatXmltvDate(date) {
  const yyyy = date.getUTCFullYear();
  const mm = String(date.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(date.getUTCDate()).padStart(2, '0');
  const hh = String(date.getUTCHours()).padStart(2, '0');
  const min = String(date.getUTCMinutes()).padStart(2, '0');
  const ss = String(date.getUTCSeconds()).padStart(2, '0');
  return `${yyyy}${mm}${dd}${hh}${min}${ss} +0000`;
}

async function main() {
  // 生成从前 2 天到后 5 天（共计 8 天）的日期列表
  const dates = [];
  for (let i = -2; i <= 7; i++) {
    dates.push(getBeijingDateStr(i));
  }

  console.log(`准备获取以下日期的 EPG 数据: ${dates.join(', ')}`);

  let xml = `<?xml version="1.0" encoding="utf-8"?>\n`;
  xml += `<!DOCTYPE tv SYSTEM "xmltv.dtd">\n`;
  xml += `<tv generator-info-name="FengShows EPG Generator">\n`;

  // 1. 写入频道基本信息
  for (const channel of CHANNELS) {
    xml += `  <channel id="${escapeXml(channel.tvgId)}">\n`;
    xml += `    <display-name lang="zh">${escapeXml(channel.name)}</display-name>\n`;
    xml += `  </channel>\n`;
  }

  // 2. 依次拉取各个频道的节目
  for (const channel of CHANNELS) {
    console.log(`正在拉取频道: ${channel.name}...`);
    let allProgrammes = [];

    for (const date of dates) {
      const url = `https://api.fengshows.cn/live/${channel.id}/resources?dir=asc&date=${date}&page=1&page_size=99`;
      try {
        const res = await fetchJson(url);
        let items = [];
        if (Array.isArray(res)) {
          items = res;
        } else if (res && Array.isArray(res.data)) {
          items = res.data;
        }

        console.log(`  - 日期 ${date}: 成功获取 ${items.length} 个节目`);
        allProgrammes.push(...items);
      } catch (err) {
        console.error(`  - 日期 ${date} 获取失败: ${err.message}`);
      }
    }

    // 根据 _id 去重，并按 event_time 升序排列
    const seenIds = new Set();
    const uniqueProgrammes = allProgrammes
      .filter(item => {
        if (!item || !item._id) return false;
        if (seenIds.has(item._id)) return false;
        seenIds.add(item._id);
        return true;
      })
      .sort((a, b) => new Date(a.event_time) - new Date(b.event_time));

    // 生成当前频道的 programme 节点
    for (let i = 0; i < uniqueProgrammes.length; i++) {
      const current = uniqueProgrammes[i];
      const start = new Date(current.event_time);
      let stop;

      if (i < uniqueProgrammes.length - 1) {
        stop = new Date(uniqueProgrammes[i + 1].event_time);
      } else {
        // 最后一个节目默认加上 30 分钟
        stop = new Date(start.getTime() + 30 * 60 * 1000);
      }

      const startStr = formatXmltvDate(start);
      const stopStr = formatXmltvDate(stop);

      xml += `  <programme start="${startStr}" stop="${stopStr}" channel="${escapeXml(channel.tvgId)}">\n`;
      xml += `    <title lang="zh">${escapeXml(current.title)}</title>\n`;
      if (current.brief) {
        xml += `    <desc lang="zh">${escapeXml(current.brief)}</desc>\n`;
      }
      xml += `  </programme>\n`;
    }
  }

  xml += `</tv>\n`;

  // 3. 压缩并写入本地文件
  try {
    const compressed = await gzipAsync(Buffer.from(xml, 'utf-8'));
    
    // 定位目标输出路径（相对于当前运行脚本文件所在的目录）
    const outputPath = path.join(__dirname, '../../parts/phx.xml.gz');
    const targetDir = path.dirname(outputPath);

    // 确保目标文件夹（../../parts）存在
    await fs.mkdir(targetDir, { recursive: true });
    
    // 写入文件
    await fs.writeFile(outputPath, compressed);
    console.log(`\n数据抓取并压缩成功！已保存至: ${outputPath}`);
  } catch (err) {
    console.error('保存文件时发生错误:', err);
  }
}

main();
