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
  "https://epg.pw/api/epg.xml?channel_id=410290", // ebc asia
  "https://epg.pw/api/epg.xml?channel_id=334779", // 龙华电影
  "https://epg.pw/api/epg.xml?channel_id=334835", // 龙华经典
  "https://epg.pw/api/epg.xml?channel_id=334794", // 龙华偶像
  "https://epg.pw/api/epg.xml?channel_id=334887", // 龙华戏剧
  "https://epg.pw/api/epg.xml?channel_id=334789", // 龙华日韩
  "https://epg.pw/api/epg.xml?channel_id=370247", // my cinema euro
  "https://epg.pw/api/epg.xml?channel_id=412028", // 韩国娱乐
  "https://epg.pw/api/epg.xml?channel_id=370146", // 八大综艺
  "https://epg.pw/api/epg.xml?channel_id=370231", // 八大精彩
  "https://epg.pw/api/epg.xml?channel_id=370183", // tvbs
  "https://epg.pw/api/epg.xml?channel_id=370191", // tvbs欢乐
  "https://epg.pw/api/epg.xml?channel_id=370257", // tvbs综艺
  "https://epg.pw/api/epg.xml?channel_id=370148", // tvbs精彩
  "https://epg.pw/api/epg.xml?channel_id=370258", // tvbs台剧
  "https://epg.pw/api/epg.xml?channel_id=370192", // rock enl
  "https://epg.pw/api/epg.xml?channel_id=370229", // hits
  "https://epg.pw/api/epg.xml?channel_id=370263", // 戏剧免费看1
  "https://epg.pw/api/epg.xml?channel_id=334808", // 台湾戏剧
  "https://epg.pw/api/epg.xml?channel_id=370259", // 经典电影
  "https://epg.pw/api/epg.xml?channel_id=370226", // 公视戏剧
  "https://epg.pw/api/epg.xml?channel_id=370240", // 采昌影剧
  "https://epg.pw/api/epg.xml?channel_id=370227", // 民视影剧
];

const displayNameRenames = {
  '龍華電影HD': '龍華電影台',
  '龍華經典HD': '龍華經典台',
  '龍華偶像HD': '龍華偶像台',
  '龍華戲劇HD': '龍華戲劇台',
  '龍華影劇HD': '龍華日韓台',
  '韓國娛樂台 KMTV': '韓國娛樂台',
  'TVBS精采台', 'TVBS-精采台',
  'TVBS歡樂台', 'TVBS-歡樂台',
  'TVBS綜藝台', 'TVBS-綜藝台',
  'TVBS台劇台', 'TVBS-台劇台',
  'HITS頻道', 'HITS-頻道',
  '台灣戲劇HD', '台灣戲劇台',
  '公視戲劇', '公視戲劇台'
};

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

    const builder = new xml2js.Builder();
    const xml = builder.buildObject(merged);
    fs.writeFileSync(output, xml, 'utf8');

    console.log(`Merged ${urls.length} EPG files into ${output}`);
  } catch (error) {
    core.setFailed(error.message);
  }
})();
