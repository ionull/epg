const core = require('@actions/core');
const fs = require('fs');
const fetch = require('node-fetch');
const xml2js = require('xml2js');

const urls = [
  "https://epg.pw/api/epg.xml?channel_id=410372", // 中天亚洲
  "https://epg.pw/api/epg.xml?channel_id=370246", // cinema world
  "https://epg.pw/api/epg.xml?channel_id=370144", // 三立综合
  "https://epg.pw/api/epg.xml?channel_id=334970", // amc电影台
  "https://epg.pw/api/epg.xml?channel_id=369171", // rock action
  "https://epg.pw/api/epg.xml?channel_id=369325", // 中视
  "https://epg.pw/api/epg.xml?channel_id=370185", // 民视综艺台
  "https://epg.pw/api/epg.xml?channel_id=370150", // 靖天综合台
  "https://epg.pw/api/epg.xml?channel_id=368894", // 靖天欢乐台
  "https://epg.pw/api/epg.xml?channel_id=370149", // 愛爾達娛樂台
  "https://epg.pw/api/epg.xml?channel_id=368585", // Mezzo Live HD
  "https://epg.pw/api/epg.xml?channel_id=370244", // 影迷数位电影台
  "https://epg.pw/api/epg.xml?channel_id=410773", // 影迷数位纪实台
  "https://epg.pw/api/epg.xml?channel_id=370151", // 靖天日本
  "https://epg.pw/api/epg.xml?channel_id=370241", // 靖天映画
  "https://epg.pw/api/epg.xml?channel_id=370233", // 靖天戏剧
  "https://epg.pw/api/epg.xml?channel_id=370242", // 靖天电影
  "https://epg.pw/api/epg.xml?channel_id=370234", // 靖洋戏剧台
  "https://epg.pw/api/epg.xml?channel_id=410285", // now baogu
  "https://epg.pw/api/epg.xml?channel_id=410286", // now baogu xingying
  "https://epg.pw/api/epg.xml?channel_id=369806", // e-Le
  "https://epg.pw/api/epg.xml?channel_id=410290"  // ebc asia
];

async function fetchAndParse(url) {
  const res = await fetch(url);
  const text = await res.text();
  return xml2js.parseStringPromise(text);
}

(async () => {
  try {
    const output = core.getInput('output');
    const parsed = await Promise.all(urls.map(fetchAndParse));

    const merged = {
      tv: {
        $: parsed[0].tv.$,
        channel: [],
        programme: []
      }
    };

    for (const p of parsed) {
      merged.tv.channel.push(...(p.tv.channel || []));
      merged.tv.programme.push(...(p.tv.programme || []));
    }

    const builder = new xml2js.Builder();
    const xml = builder.buildObject(merged);
    fs.writeFileSync(output, xml, 'utf8');

    console.log(`Merged ${urls.length} EPG files into ${output}`);
  } catch (error) {
    core.setFailed(error.message);
  }
})();
