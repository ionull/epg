const core = require('@actions/core');
const fs = require('fs');
const fetch = require('node-fetch');
const xml2js = require('xml2js');
const zlib = require('zlib');
const { pipeline } = require('stream/promises');
const { Readable } = require('stream');
const path = require('path');

const displayNameRenames = {
  '龍華電影HD': '龍華電影台',
  '龍華經典HD': '龍華經典台',
  '龍華偶像HD': '龍華偶像台',
  '龍華戲劇HD': '龍華戲劇台',
  '龍華影劇HD': '龍華日韓台',
  '韓國娛樂台 KMTV': '韓國娛樂台',
  //'TVBS精采台': 'TVBS-精采台',
  //'TVBS歡樂台': 'TVBS-歡樂台',
  //'TVBS綜藝台': 'TVBS-綜藝台',
  //'TVBS台劇台': 'TVBS-台劇台',
  //'HITS頻道': 'HITS-頻道',
  '台灣戲劇HD': '台灣戲劇台',
  '公視戲劇': '公視戲劇台',
  //'ViuTVsix': 'ViuTV-Six',
  '港台电视31': '港台電視31',
  '港台电视32': '港台電視32',
  'CHC高清电影': 'CHC影迷电影',
  'KLT-靖天國際台': '靖天國際台',
  //'fun探索娛樂台': 'Fun-探索娛樂台',
  'CNA': '亞洲新聞台',
  '南国都市4K': '南国都市',
  'MCE 我的歐洲電影台': 'My Cinema Europe HD 我的歐洲電影',
  'NHK WORLD-JAPAN': 'NHK World Japan',
  'FRANCE24 英文台': 'France 24 English',
  'TVBS新聞': 'TVBS新聞台',
  '靖天映畫': '靖天映畫台',
};

async function fetchAndParse(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch ${url}`);

  const isGz = url.endsWith('.gz');

  const buffer = await res.buffer();
  const xml = isGz
    ? await gunzipBuffer(buffer)
    : buffer.toString('utf8');

  return xml2js.parseStringPromise(xml);
}

async function gunzipBuffer(buffer) {
  return new Promise((resolve, reject) => {
    zlib.gunzip(buffer, (err, output) => {
      if (err) reject(err);
      else resolve(output.toString('utf8'));
    });
  });
}


(async () => {
  try {
    const output = core.getInput('output');
    const configPath = core.getInput('config');
    const configEntries = JSON.parse(fs.readFileSync(configPath, 'utf-8'));

    const parsed = []

    for (const entry of configEntries) {
      const { url } = entry;
      if (!url) continue;

      try {
        const data = await fetchAndParse(url);
        parsed.push({ data, url, filterNames: entry.filter_names || [] });
      } catch (err) {
        console.warn(`⚠️ Failed to fetch/parse ${url}: ${err.message}`);
      }
    }

    const merged = {
      tv: {
        $: parsed[0].data.tv.$,
        channel: [],
        programme: []
      }
    };

    for (const entry of parsed) {
      const p = entry.data;
      const url = entry.url;
      const filterNames = entry.filterNames;

      const allChannels = p.tv.channel || [];
      const allProgrammes = p.tv.programme || [];

      if (filterNames.length > 0) {
        const filteredChannels = allChannels.filter(ch => {
          const nameObj = ch['display-name']?.[0];
          const name = nameObj?._?.trim();
          return filterNames.includes(name);
        });
        // console.log('filteredChannels', filteredChannels);

        const allowedIds = filteredChannels.map(ch => ch.$.id);

        const filteredProgrammes = allProgrammes.filter(prog =>
          allowedIds.includes(prog.$.channel)
        );

        for (const ch of filteredChannels || []) {
          const nameObj = ch['display-name']?.[0];
          const name = nameObj?._?.trim();

          if (name && displayNameRenames[name]) {
            nameObj._ = displayNameRenames[name];
          }
          merged.tv.channel.push(ch);
        }

        //merged.tv.channel.push(...filteredChannels);
        merged.tv.programme.push(...filteredProgrammes);
      } else {
        for (const ch of p.tv.channel || []) {
          const nameObj = ch['display-name']?.[0];
          const name = nameObj?._?.trim();

          if (name && displayNameRenames[name]) {
            nameObj._ = displayNameRenames[name];
          }
          merged.tv.channel.push(ch);
        }
        merged.tv.programme.push(...(p.tv.programme || []));
      }
    }

    const builder = new xml2js.Builder();
    const xml = builder.buildObject(merged);

    const baseOutput = output.endsWith('.gz') ? output.replace(/\.gz$/, '') : output;
    const gzipOutput = `${baseOutput}.gz`;

    // Save plain XML
    // fs.writeFileSync(baseOutput, xml, 'utf8');
    // console.log(`Saved plain XML file: ${baseOutput}`);

    // Save .gz compressed version
    zlib.gzip(xml, (err, buffer) => {
      if (err) {
        core.setFailed(`Gzip error: ${err.message}`);
        return;
      }
      fs.writeFileSync(gzipOutput, buffer);
      console.log(`Saved compressed file: ${gzipOutput}`);
    });
  } catch (error) {
    core.setFailed(error.message);
  }
})();
