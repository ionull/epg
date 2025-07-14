const core = require('@actions/core');
const fs = require('fs');
const fetch = require('node-fetch');
const xml2js = require('xml2js');
const zlib = require('zlib');
const { pipeline } = require('stream/promises');
const { Readable } = require('stream');
const path = require('path');

const urls = [
  "https://raw.githubusercontent.com/AqFad2811/epg/refs/heads/main/singapore.xml", // singapore
  "https://epg.pw/api/epg.xml?channel_id=410274", // viutv
  "https://epg.pw/api/epg.xml?channel_id=410273", // viutv6
  "https://epg.pw/api/epg.xml?channel_id=368550", // rthk31
  "https://epg.pw/api/epg.xml?channel_id=368551", // rthk32
  "https://epg.pw/api/epg.xml?channel_id=410372", // 中天亚洲
  "https://epg.pw/api/epg.xml?channel_id=370246", // cinema world
  "https://epg.pw/api/epg.xml?channel_id=370144", // 三立综合
  "https://epg.pw/api/epg.xml?channel_id=334970", // amc电影台
  "https://epg.pw/api/epg.xml?channel_id=369171", // rock action
  "https://epg.pw/api/epg.xml?channel_id=369325", // 中视
  "https://epg.pw/api/epg.xml?channel_id=370185", // 民视综艺台
  "https://epg.pw/api/epg.xml?channel_id=370150", // 靖天综合台
  "https://epg.pw/api/epg.xml?channel_id=368894", // 靖天欢乐台
  "https://epg.pw/api/epg.xml?channel_id=370188", // 靖天国际
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
  "https://epg.pw/api/epg.xml?channel_id=334736", // my cinema euro
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
  "https://epg.pw/api/epg.xml?channel_id=370186", // 猪哥亮
  "https://epg.pw/api/epg.xml?channel_id=370138", // 民视台湾
  "https://epg.pw/api/epg.xml?channel_id=370139", // 民视
  "https://epg.pw/api/epg.xml?channel_id=370141", // 中视
  "https://epg.pw/api/epg.xml?channel_id=370142", // 中视经典
  "https://epg.pw/api/epg.xml?channel_id=370147", // 中视菁采
  "https://epg.pw/api/epg.xml?channel_id=370195", // trace urban
  "https://epg.pw/api/epg.xml?channel_id=370197", // mezzo live
  "https://epg.pw/api/epg.xml?channel_id=370198", // classica
  "https://epg.pw/api/epg.xml?channel_id=370218", // 幸福空间
  "https://epg.pw/api/epg.xml?channel_id=370224", // tv5monde
  "https://epg.pw/api/epg.xml?channel_id=370196", // mtv
  "https://epg.pw/api/epg.xml?channel_id=370193", // livetime
  "https://epg.pw/api/epg.xml?channel_id=370194", // cmusic
  "https://epg.pw/api/epg.xml?channel_id=370217", // fun探索
  "https://epg.pw/api/epg.xml?channel_id=370209", // 时尚运动
  "https://epg.pw/api/epg.xml?channel_id=370143", // 华视
  "https://epg.pw/api/epg.xml?channel_id=370158", // davinci
  "https://epg.pw/api/epg.xml?channel_id=370163", // 靖天卡通
  "https://epg.pw/api/epg.xml?channel_id=370187", // 靖天育乐
  "https://epg.pw/api/epg.xml?channel_id=370260", // 经典卡通
  "https://epg.pw/api/epg.xml?channel_id=370164", // nice bingo
  "https://epg.pw/api/epg.xml?channel_id=370159", // eltv english
  "https://epg.pw/api/epg.xml?channel_id=410360", // nickelodeon
  "https://epg.pw/api/epg.xml?channel_id=370157", // liveabc
  "https://epg.pw/api/epg.xml?channel_id=370160", // nick jr
  "https://epg.pw/api/epg.xml?channel_id=370262", // 精选动漫
  "https://epg.pw/api/epg.xml?channel_id=370167", // momo
  "https://epg.pw/api/epg.xml?channel_id=370162", // dreamworks
  "https://epg.pw/api/epg.xml?channel_id=414181", // INULTRA
  "https://epg.pw/api/epg.xml?channel_id=370254", // DW
  "https://epg.pw/api/epg.xml?channel_id=434232", // nhk world jp
  "https://epg.pw/api/epg.xml?channel_id=374123", // france 24 eng
  "https://epg.pw/api/epg.xml?channel_id=370178", // bloomberg
  "https://epg.pw/api/epg.xml?channel_id=370253", // cnbc asia
  "https://epg.pw/api/epg.xml?channel_id=370223", // luxe tv
  "https://epg.pw/api/epg.xml?channel_id=370220", // history
  "https://epg.pw/api/epg.xml?channel_id=370153", // global trekker
  "https://epg.pw/api/epg.xml?channel_id=370215", // rollor
  "https://epg.pw/api/epg.xml?channel_id=370177", // cti news
  "https://epg.pw/api/epg.xml?channel_id=369324", // ctv news
  "https://epg.pw/api/epg.xml?channel_id=370179",
  "https://epg.pw/api/epg.xml?channel_id=408104",
  "https://epg.pw/api/epg.xml?channel_id=370170", // ebc news
  "https://epg.pw/api/epg.xml?channel_id=370174", // tvbs news
  "https://epg.pw/api/epg.xml?channel_id=370172",
  "https://epg.pw/api/epg.xml?channel_id=370211", // ginx
  "https://epg.pw/api/epg.xml?channel_id=369154", // 靖天映画
  "https://epg.pw/api/epg.xml?channel_id=370152", // arirang
  "https://epg.pw/api/epg.xml?channel_id=370210", // bike
  "https://epg.pw/api/epg.xml?channel_id=370235", // ci
  "https://epg.pw/api/epg.xml?channel_id=370145", // hokka
  "https://epg.pw/api/epg.xml?channel_id=370236", // cnex
  "https://epg.pw/api/epg.xml?channel_id=370222", // elta travel
  "https://epg.pw/api/epg.xml?channel_id=408106", // asia travel
  "https://epg.112114.xyz/pp.xml.gz", // cn
  "http://e.erw.cc/e.xml.gz", // cn local
];

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
