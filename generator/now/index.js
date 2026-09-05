const axios = require("axios");
const cheerio = require("cheerio");
const fs = require("fs");
const path = require("path");
const zlib = require("zlib");
const dayjs = require("dayjs");
const utc = require("dayjs/plugin/utc");
const timezone = require("dayjs/plugin/timezone");
const customParseFormat = require("dayjs/plugin/customParseFormat");
const { create } = require("xmlbuilder2");

dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.extend(customParseFormat);

// 延迟辅助函数，避免请求过密
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

(async () => {
  const now = dayjs().tz("Asia/Hong_Kong");

  // 需要抓取的频道列表 (id 为可选字段，有 id 则作为 channel id，否则使用 name)
  const networks = [
    { code: "632", name: "Now Sports 2" },
    { code: "096", name: "ViuTVSix" },
    { code: "099", name: "ViuTV" }, 
    //{ code: "631", name: "Now 631台" },
    //{ code: "630", name: "Now 630台" },
    { code: "332", name: "NOW新闻台" },
    { code: "333", name: "NOW财经台" },
    { code: "538", name: "中天亞洲台" },
    { code: "527", name: "亞洲美食台" },
    { code: "111", name: "HBO Hits" },
    { code: "112", name: "HBO Family" },
    { code: "113", name: "CINEMAX" },
    { code: "114", name: "HBO Signature" },
    { code: "115", name: "HBO" },
    { code: "150", name: "Animax", id: "Animax.zh" },
    { code: "155", name: "tvN" },
    { code: "156", name: "KBS World" },
    { code: "119", name: "HITS MOVIES" },
    { code: "217", name: "Love Nature" },
    { code: "512", name: "AXN" },
    { code: "513", name: "HITS" },
    //{ code: "621", name: "Now 英超 1 台" },
    // 需要更多频道可在此继续追加
  ];

  const partsDir = path.join(__dirname, "../../parts");
  if (!fs.existsSync(partsDir)) {
    fs.mkdirSync(partsDir, { recursive: true });
  }

  // 1:1 还原真实的浏览器请求头，防止被反爬拦截
  const browserHeaders = {
    "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
    "accept-language": "zh-HK,zh;q=0.9,en-US;q=0.8,en;q=0.7",
    "cache-control": "max-age=0",
    "priority": "u=0, i",
    "sec-ch-ua": '"Opera Air";v="133", "Chromium";v="149", "Not)A;Brand";v="24"',
    "sec-ch-ua-mobile": "?0",
    "sec-ch-ua-platform": '"macOS"',
    "sec-fetch-dest": "document",
    "sec-fetch-mode": "navigate",
    "sec-fetch-site": "none",
    "sec-fetch-user": "?1",
    "upgrade-insecure-requests": "1",
    "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36 OPR/133.0.0.0"
  };

  // 创建 XMLTV 根节点 <tv>
  const root = create({ version: "1.0", encoding: "UTF-8" }).ele("tv");

  // === Step 1: 写入频道节点 <channel> ===
  for (const net of networks) {
    // 优先使用自定义 id，否则使用 name 作为 id
    const channelId = net.id || net.name;
    const chanEle = root.ele("channel", { id: channelId });

    // 支持逗号分割的多 display-name
    const displayNames = (net.name || "")
      .split(/[,，]/)
      .map((name) => name.trim())
      .filter(Boolean);

    for (const name of displayNames) {
      chanEle.ele("display-name").txt(name).up();
    }

    chanEle.up();
  }

  const allProgrammes = [];

  // === Step 2: 遍历频道爬取并解析 HTML ===
  for (const net of networks) {
    const channelId = net.id || net.name;
    const url = `https://nowplayer.now.com/tvguide/channeldetail/${net.code}/1?lang=zh`;
    console.log(`📡 Fetching [${channelId}] (${net.code}) from ${url}`);

    try {
      const { data: html } = await axios.get(url, {
        headers: browserHeaders,
        timeout: 20000,
      });

      const $ = cheerio.load(html);
      let channelProgCount = 0;

      // 遍历 7 天 (day1 ~ day7)
      for (let dayIdx = 1; dayIdx <= 7; dayIdx++) {
        const targetDate = now.add(dayIdx - 1, "day").format("YYYY-MM-DD");
        const $dayContainer = $(`#day${dayIdx}`);

        if ($dayContainer.length === 0) continue;

        $dayContainer.find("ul li").each((_, el) => {
          const $li = $(el);
          const timeText = $li.find(".time").text().trim(); // 如 "12:30AM", "02:00PM"

          // 提取标题并过滤掉内部的 <span class="live-btn">播放中</span> 等标签
          const $nameEl = $li.find(".prograam-name, .program-name").clone();
          $nameEl.find("span").remove();
          const title = $nameEl.text().replace(/\s+/g, " ").trim();

          if (!timeText || !title) return;

          // 解析开播时间为绝对时间戳 (香港时区)
          const startDt = dayjs.tz(
            `${targetDate} ${timeText}`,
            "YYYY-MM-DD hh:mmA",
            "Asia/Hong_Kong"
          );

          if (startDt.isValid()) {
            allProgrammes.push({
              channelId: channelId, // 绑定计算后的 channelId
              startDt: startDt,
              title: title,
            });
            channelProgCount++;
          }
        });
      }

      console.log(`✅ Added ${net.name} (共解析到 ${channelProgCount} 个节目)`);
    } catch (err) {
      console.error(`❌ Error fetching ${net.name}: ${err.message}`);
    }

    await sleep(300); // 请求间隔，保护爬虫
  }

  // === Step 3: 计算节目结束时间并构建 <programme> ===
  const programmesByChannel = networks.reduce((acc, net) => {
    const channelId = net.id || net.name;
    acc[channelId] = [];
    return acc;
  }, {});

  for (const p of allProgrammes) {
    if (programmesByChannel[p.channelId]) {
      programmesByChannel[p.channelId].push(p);
    }
  }

  for (const channelId of Object.keys(programmesByChannel)) {
    const progs = programmesByChannel[channelId].sort(
      (a, b) => a.startDt.valueOf() - b.startDt.valueOf()
    );

    for (let i = 0; i < progs.length; i++) {
      const p = progs[i];
      const next = progs[i + 1];

      // 当前节目的结束时间等于下一节目的开始时间；最后一个节目默认 +2 小时
      const stopDt = next ? next.startDt : p.startDt.add(2, "hour");

      const start = p.startDt.format("YYYYMMDDHHmmss +0800");
      const stop = stopDt.format("YYYYMMDDHHmmss +0800");

      const prog = root.ele("programme", {
        start,
        stop,
        channel: channelId, // 严格对应 channelId
      });
      prog.ele("title", { lang: "zh" }).txt(p.title).up();
      prog.up();
    }
  }

  // === Step 4: 压缩输出为 nowtv.xml.gz ===
  const xmlStr = root.end({ prettyPrint: true });
  const gzPath = path.join(partsDir, "nowtv.xml.gz");

  await new Promise((resolve, reject) => {
    const gzip = zlib.createGzip();
    const dest = fs.createWriteStream(gzPath);
    gzip.on("error", reject);
    dest.on("finish", resolve);
    dest.on("error", reject);

    gzip.end(Buffer.from(xmlStr, "utf-8"));
    gzip.pipe(dest);
  });

  console.log(`🎉 Compressed NowTV EPG saved to ${gzPath}`);
})();
