const core = require('@actions/core');
const fs = require('fs');
const fetch = require('node-fetch');
const xml2js = require('xml2js');
const zlib = require('zlib');
const path = require('path');

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
  "SUPER金曲 (免費)": "SUPER金曲",
  "SUPER Music (免費)": "SUPER Music",
  "SUPER獎門人 (免費)": "SUPER獎門人",
  "SUPER EYT (免費)": "SUPER EYT",
  "SUPER識食 (免費)": "SUPER識食",
  "SUPER識嘆 (免費)": "SUPER識嘆", 
  "SUPER煲劇 (免費)": "SUPER煲劇",
  "SUPER劇場 (免費)": "SUPER劇場",
  "SUPER話當年 (免費)": "SUPER話當年",
  "SUPER Sports (免費)": "SUPER Sports",
  "TVB Plus (免費)": "TVB Plus",
  "深圳移动": "深圳移动电视",
  "东莞新闻": "东莞新闻综合",
  "SS La Liga": "SuperSport LaLiga",
  "Willow Cricket HDTV (WILLOWHD)": "Willow Cricket",
  "鳳凰衛視資訊台": "凤凰资讯",
  "鳳凰衛視香港台": "凤凰香港",
  "鳳凰衛視中文台": "凤凰中文",
  "Hub Sports 1  HD": "Hub Sports 1 HD",
  "Crime + Investigation HD": "Crime + Investigation",
  "Lifetime HD": "Lifetime",
  "Travelxp HD": "Travelxp",
  "TVBS 歡樂台": "TVBS歡樂台",
  "CHC家庭电影": "CHC家庭影院",
  "Racing TV HD": "Racing TV",
  "深圳衛視": "深圳国际",
  "Zhejiang": "浙江国际",
  "momo綜合台HD": "MOMOTV",
};

async function fetchAndParse(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch ${url}`);
  const isGz = url.endsWith('.gz');
  const buffer = await res.buffer();
  const xml = isGz ? zlib.gunzipSync(buffer).toString('utf8') : buffer.toString('utf8');
  return xml2js.parseStringPromise(xml);
}

(async () => {
  try {
    const output = core.getInput('output');
    const configPath = core.getInput('config');
    const configEntries = JSON.parse(fs.readFileSync(configPath, 'utf-8'));

    const merged = {
      tv: {
        $: { generator: 'Merged-EPG-Script' },
        channel: [],
        programme: []
      }
    };

    let isFirstFile = true;

    for (const entry of configEntries) {
      const { url, filter_names = [], replace_id = false } = entry;
      if (!url) continue;

      try {
        console.log(`Processing: ${url}`);
        const data = await fetchAndParse(url);
        
        if (isFirstFile && data.tv && data.tv.$) {
          merged.tv.$ = data.tv.$;
          isFirstFile = false;
        }

        const sourceChannels = data.tv.channel || [];
        const sourceProgrammes = data.tv.programme || [];
        
        // 1. Identify which channels to keep
        let channelsToProcess = [];
        if (filter_names.length > 0) {
          channelsToProcess = sourceChannels.filter(ch => {
            const name = ch['display-name']?.[0]?._?.trim();
            return filter_names.includes(name);
          });
        } else {
          channelsToProcess = sourceChannels;
        }

        const allowedSourceIds = new Set(channelsToProcess.map(ch => ch.$.id));
        const idReplacementMap = new Map(); // Maps Old ID -> New ID (Display Name)

        // 2. Process and Rename Channels
        for (const ch of channelsToProcess) {
          const nameObj = ch['display-name']?.[0];
          let currentName = nameObj?._?.trim();

          // Apply display name renames if configured
          if (currentName && displayNameRenames[currentName]) {
            currentName = displayNameRenames[currentName];
            nameObj._ = currentName;
          }

          // If replace_id is true, map the old ID to the (potentially renamed) display name
          if (replace_id && currentName) {
            const oldId = ch.$.id;
            const newId = currentName;
            idReplacementMap.set(oldId, newId);
            ch.$.id = newId; // Update the channel object ID
          }

          merged.tv.channel.push(ch);
        }

        // 3. Process Programmes
        for (const prog of sourceProgrammes) {
          const progChannelId = prog.$.channel;

          // Only include if the channel survived the filter
          if (allowedSourceIds.has(progChannelId)) {
            // If we are replacing IDs, update the programme's channel pointer
            if (replace_id && idReplacementMap.has(progChannelId)) {
              prog.$.channel = idReplacementMap.get(progChannelId);
            }
            merged.tv.programme.push(prog);
          }
        }

        data.tv = null; // Memory cleanup
      } catch (err) {
        console.warn(`⚠️ Skipping ${url} due to error: ${err.message}`);
      }
    }

    console.log(`Final counts: ${merged.tv.channel.length} channels, ${merged.tv.programme.length} programmes.`);

    const builder = new xml2js.Builder();
    const xmlString = builder.buildObject(merged);
    const compressed = zlib.gzipSync(xmlString);
    
    const baseOutput = output.endsWith('.gz') ? output.replace(/\.gz$/, '') : output;
    fs.writeFileSync(`${baseOutput}.gz`, compressed);
    console.log(`✅ Success! File saved to: ${baseOutput}.gz`);

  } catch (error) {
    core.setFailed(`Script failed: ${error.message}`);
  }
})();
