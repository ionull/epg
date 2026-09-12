const fs = require('fs');
const zlib = require('zlib');
const path = require('path');
const xml2js = require('./lib/xml2js');

// ==================== 原生替代 @actions/core ====================
const core = {
  getInput(name) {
    const key = `INPUT_${name.replace(/ /g, '_').toUpperCase()}`;
    return (process.env[key] || '').trim();
  },
  setFailed(msg) {
    console.error(`::error::${msg}`);
    process.exitCode = 1;
  }
};

// ==================== 频道名称重命名映射 ====================
const displayNameRenames = {
  '龍華電影HD': '龍華電影台',
  '龍華經典HD': '龍華經典台',
  '龍華偶像HD': '龍華偶像台',
  '龍華戲劇HD': '龍華戲劇台',
  '龍華影劇HD': '龍華日韓台',
  '龍華洋片HD': '龍華洋片台',
  'Celestial Movies (HD)': '天映頻道',
  '韓國娛樂台 KMTV': '韓國娛樂台',
  '台灣戲劇HD': '台灣戲劇台',
  '公視戲劇': '公視戲劇台',
  'Nice TV 靖天歡樂台': '靖天歡樂台',
  '港台电视31': '港台電視31',
  '港台电视32': '港台電視32',
  'CHC高清电影': 'CHC影迷电影',
  'KLT-靖天國際台': '靖天國際台',
  'CNA': '亞洲新聞台',
  '南国都市4K': '南国都市',
  'MCE 我的歐洲電影台': 'My Cinema Europe HD 我的歐洲電影',
  'NHK WORLD-JAPAN': 'NHK World Japan',
  'FRANCE24 英文台': 'France 24 English',
  'TVBS新聞': 'TVBS新聞台',
  '靖天映畫': '靖天映畫台',
  '黃金翡翠台 (免費)': '黃金翡翠台',
  'SUPER FREE (免費)': 'myTV SUPER FREE',
  '無綫新聞台 (免費)': '無綫新聞台',
  '28AI智慧賽馬 (免費)': '28 AI 智慧賽馬',
  '娛樂新聞台 (免費)': '娛樂新聞台',
  '創世電視 (免費)': '創世電視',
  'SUPER金曲 (免費)': 'SUPER金曲',
  'SUPER Music (免費)': 'SUPER Music',
  'SUPER獎門人 (免費)': 'SUPER獎門人',
  'SUPER EYT (免費)': 'SUPER EYT',
  'SUPER識食 (免費)': 'SUPER識食',
  'SUPER識嘆 (免費)': 'SUPER識嘆', 
  'SUPER煲劇 (免費)': 'SUPER煲劇',
  'SUPER劇場 (免費)': 'SUPER劇場',
  'SUPER話當年 (免費)': 'SUPER話當年',
  'SUPER Sports (免費)': 'SUPER Sports',
  'TVB Plus (免費)': 'TVB Plus',
  '深圳移动': '深圳移动电视',
  '东莞新闻': '东莞新闻综合',
  'SS La Liga': 'SuperSport LaLiga',
  'Willow Cricket HDTV (WILLOWHD)': 'Willow Cricket',
  '鳳凰衛視資訊台': '凤凰资讯',
  '鳳凰衛視香港台': '凤凰香港',
  '鳳凰衛視中文台': '凤凰中文',
  'Hub Sports 1  HD': 'Hub Sports 1 HD',
  'Crime + Investigation HD': 'Crime + Investigation',
  'Lifetime HD': 'Lifetime',
  'Travelxp HD': 'Travelxp',
  'TVBS 歡樂台': 'TVBS歡樂台',
  'CHC家庭电影': 'CHC家庭影院',
  'Racing TV HD': 'Racing TV',
  '深圳衛視': '深圳国际',
  'Zhejiang': '浙江国际',
  'momo綜合台HD': 'MOMOTV',
  '博斯運動二台HD': '博斯運動二台',
  'Channel 251': 'FIFA World Cup CH01',
  'viu6': 'ViuTV-Six',
};

// ==================== 辅助函数 ====================

/**
 * 安全提取节点文本（兼容纯文本与带 lang 等属性的对象）
 */
function getNodeText(node) {
  if (node === null || node === undefined) return '';
  if (typeof node === 'string') return node.trim();
  if (typeof node === 'object' && node._ !== undefined) return String(node._).trim();
  return String(node).trim();
}

/**
 * 安全更新节点文本并保留原有属性
 */
function updateNodeText(node, newText) {
  if (typeof node === 'object' && node !== null && node._ !== undefined) {
    node._ = newText;
    return node;
  }
  return newText;
}

/**
 * 原生 Fetch 获取并解压 XML
 */
async function fetchAndParseXml(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
  
  const arrayBuffer = await res.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  
  // 检查是否为 Gzip 格式（通过 URL 后缀或 Magic Number: 0x1F 0x8B）
  const isGz = url.endsWith('.gz') || (buffer.length > 2 && buffer[0] === 0x1f && buffer[1] === 0x8b);
  const xmlStr = isGz ? zlib.gunzipSync(buffer).toString('utf8') : buffer.toString('utf8');
  
  return xml2js.parseStringPromise(xmlStr);
}

// ==================== 主流程 ====================
(async () => {
  try {
    const output = core.getInput('output') || 'merged.xml.gz';
    const configPath = core.getInput('config') || 'config.json';
    const configEntries = JSON.parse(fs.readFileSync(configPath, 'utf-8'));

    const merged = {
      tv: {
        $: { 'generator-info-name': 'Merged-EPG-Script' },
        channel: [],
        programme: []
      }
    };

    let isFirstFile = true;

    for (const entry of configEntries) {
      const { url, filter_names = [], replace_id = false } = entry;
      if (!url) continue;
      if (replace_id) console.log(`[replace_id enabled]: ${url}`);

      try {
        console.log(`Processing: ${url}`);
        const data = await fetchAndParseXml(url);
        if (!data || !data.tv) continue;

        // 保留第一个源文件的根节点属性
        if (isFirstFile && data.tv.$) {
          merged.tv.$ = { ...data.tv.$ };
          isFirstFile = false;
        }

        const sourceChannels = data.tv.channel || [];
        const sourceProgrammes = data.tv.programme || [];
        
        const allowedSourceIds = new Set();
        const idReplacementMap = new Map(); // 旧 ID -> 新 ID (主 Display Name)

        // 1. 处理频道与重命名
        for (const ch of sourceChannels) {
          const chId = ch.$?.id || '';
          const rawNames = Array.isArray(ch['display-name']) ? ch['display-name'] : (ch['display-name'] ? [ch['display-name']] : []);
          const displayNames = rawNames.map(getNodeText).filter(Boolean);

          // 频道过滤（filter_names 为空全保留，否则需匹配 ID 或任意 display-name）
          const isAllowed = filter_names.length === 0 || filter_names.some(target => 
            target === chId || displayNames.includes(target)
          );

          if (!isAllowed) continue;

          allowedSourceIds.add(chId);

          let primaryName = '';
          // 遍历并更新每一个 display-name（支持别名全部重命名）
          for (let i = 0; i < rawNames.length; i++) {
            let currentName = getNodeText(rawNames[i]);
            if (currentName && displayNameRenames[currentName]) {
              const newName = displayNameRenames[currentName];
              rawNames[i] = updateNodeText(rawNames[i], newName);
              currentName = newName;
            }
            if (i === 0) primaryName = currentName;
          }

          ch['display-name'] = rawNames;

          // 若开启 replace_id，将旧 ID 映射为主 display-name
          if (replace_id && primaryName) {
            idReplacementMap.set(chId, primaryName);
            ch.$.id = primaryName;
          }

          merged.tv.channel.push(ch);
        }

        // 2. 处理节目（Programme）
        for (const prog of sourceProgrammes) {
          const progChannelId = prog.$?.channel;

          // 仅保留通过过滤的频道所属节目
          if (allowedSourceIds.has(progChannelId)) {
            // 同步修改节目的所属 channel ID
            if (replace_id && idReplacementMap.has(progChannelId)) {
              prog.$.channel = idReplacementMap.get(progChannelId);
            }
            merged.tv.programme.push(prog);
          }
        }

      } catch (err) {
        console.warn(`⚠️ Skipping ${url} due to error: ${err.message}`);
      }
    }

    console.log(`Final counts: ${merged.tv.channel.length} channels, ${merged.tv.programme.length} programmes.`);

    // 3. 构建并压缩写入文件
    const builder = new xml2js.Builder({
      renderOpts: { pretty: true, indent: '  ', newline: '\n' },
      xmldec: { version: '1.0', encoding: 'UTF-8' }
    });
    
    const xmlString = builder.buildObject(merged);
    const compressed = zlib.gzipSync(Buffer.from(xmlString, 'utf-8'));
    
    const baseOutput = output.endsWith('.gz') ? output.replace(/\.gz$/, '') : output;
    fs.writeFileSync(`${baseOutput}.gz`, compressed);
    console.log(`✅ Success! File saved to: ${baseOutput}.gz`);

  } catch (error) {
    core.setFailed(`Script failed: ${error.message}`);
  }
})();
