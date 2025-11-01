const axios = require("axios");
const fs = require("fs");
const path = require("path");
const zlib = require("zlib");
const dayjs = require("dayjs");
const utc = require("dayjs/plugin/utc");
const timezone = require("dayjs/plugin/timezone");
const { create } = require("xmlbuilder2");

dayjs.extend(utc);
dayjs.extend(timezone);

(async () => {
  const now = dayjs().tz("Asia/Shanghai");
  const from = now.format("YYYYMMDD");
  const to = now.add(7, "day").format("YYYYMMDD");

  // Define MyTVSuper channels
  const networks = [
    { code: "CMAM", name: "美亞電影台" },
    { code: "POPC", name: "PopC" },
    { code: "CTHR", name: "Thrill" },
    { code: "CKIX", name: "KIX" },
    { code: "CAXN", name: "AXN" },
    { code: "CJTV", name: "tvN" },
    { code: "CANI", name: "Animax" },
    { code: "RKEX", name: "ROCK Extreme" },
    { code: "CRTE", name: "ROCK綜藝娛樂" },
    { code: "CCCM", name: "天映經典頻道" },
    { code: "CMC", name: "中國電影頻道" },
    { code: "ACTM", name: "Action Hollywood Movies" },
    { code: "RCM", name: "Rialto Classic Movies (RCM)" },
    { code: "B", name: "TVB Plus" },
    { code: "P", name: "明珠台" },
    { code: "C", name: "無綫新聞台" },
    // Add more channels here if needed
  ];

  const partsDir = path.join(__dirname, "../../parts");
  if (!fs.existsSync(partsDir)) {
    fs.mkdirSync(partsDir, { recursive: true });
  }

  // Create root <tv>
  const root = create({ version: "1.0", encoding: "UTF-8" }).ele("tv");

  // Collect programme data
  const allProgrammes = [];

  // === Step 1: Add all channels first ===
  for (const net of networks) {
    root
      .ele("channel", { id: net.name })
        .ele("display-name").txt(net.name).up()
      .up();
  }

  // === Step 2: Fetch and accumulate EPGs ===
  for (const net of networks) {
    const url = `https://content-api.mytvsuper.com/v1/epg?platform=web&country_code=US&network_code=${net.code}&from=${from}&to=${to}`;
    console.log(`📡 Fetching ${net.name} (${net.code}) from ${url}`);

    try {
      const { data } = await axios.get(url, { timeout: 30000 });

      if (!Array.isArray(data) || data.length === 0) {
        console.warn(`⚠️ No EPG data for ${net.name}`);
        continue;
      }

      for (const item of data[0].item || []) {
        for (const epg of item.epg || []) {
          // Keep raw datetime for calculations
          const startRaw = epg.start_datetime;

          allProgrammes.push({
            channel: net.name,
            startRaw, // ISO string for calculations
            titleZh: epg.programme_title_tc || "",
            titleEn: epg.programme_title_en || "",
            descZh: epg.episode_synopsis_tc || "",
            descEn: epg.episode_synopsis_en || "",
          });
        }
      }

      console.log(`✅ Added ${net.name} (${data[0].item?.length || 0} days)`);
    } catch (err) {
      console.error(`❌ Error fetching ${net.name}: ${err.message}`);
    }
  }

  // === Step 3: Append programmes with start/stop ===
  const programmesByChannel = networks.reduce((acc, net) => {
    acc[net.name] = [];
    return acc;
  }, {});

  for (const p of allProgrammes) {
    programmesByChannel[p.channel].push(p);
  }

  for (const channelName of Object.keys(programmesByChannel)) {
    const progs = programmesByChannel[channelName].sort((a, b) =>
      a.startRaw.localeCompare(b.startRaw)
    );

    for (let i = 0; i < progs.length; i++) {
      const p = progs[i];
      const next = progs[i + 1];

      // Parse ISO strings with timezone
      const startDt = dayjs.tz(p.startRaw, "Asia/Shanghai");
      const stopDt = next
        ? dayjs.tz(next.startRaw, "Asia/Shanghai")
        : startDt.add(2, "hour"); // fallback

      const start = startDt.format("YYYYMMDDHHmmss +0800");
      const stop = stopDt.format("YYYYMMDDHHmmss +0800");

      const prog = root.ele("programme", { start, stop, channel: p.channel });
      prog.ele("title", { lang: "zh" }).txt(p.titleZh).up();
      prog.ele("title", { lang: "en" }).txt(p.titleEn).up();
      prog.ele("desc", { lang: "zh" }).txt(p.descZh).up();
      prog.ele("desc", { lang: "en" }).txt(p.descEn).up();
      prog.up();
    }
  }

  // === Step 4: Write gzipped XML directly ===
  const xmlStr = root.end({ prettyPrint: true });
  const gzPath = path.join(partsDir, "mytvsuper.xml.gz");

  await new Promise((resolve, reject) => {
    const gzip = zlib.createGzip();
    const dest = fs.createWriteStream(gzPath);
    gzip.on("error", reject);
    dest.on("finish", resolve);
    dest.on("error", reject);

    // write buffer to gzip stream
    gzip.end(Buffer.from(xmlStr, "utf-8"));
    gzip.pipe(dest);
  });

  console.log(`🎉 Compressed EPG saved to ${gzPath}`);
})();
