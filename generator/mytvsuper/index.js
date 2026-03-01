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
    { code: "CTVC", name: "千禧經典台" },
    { code: "CTVS", name: "亞洲劇台" },
    { code: "CDR3", name: "華語劇台" },
    // { code: "TVO", name: "黃金華劇台" },
    { code: "CCOC", name: "戲曲台" },
    { code: "KIDS", name: "SUPER Kids Channel" },
    { code: "ZOO", name: "ZooMoo" },
    { code: "CNIKO", name: "Nickelodeon" },
    { code: "CNIJR", name: "Nick Jr" },
    { code: "CCLM", name: "粵語片台" },
    { code: "TRSP", name: "TRACE Sport Stars" },
    { code: "LNH", name: "Love Nature" },
    { code: "SMS", name: "Global Trekker" },
    { code: "PETC", name: "Pet Club TV" },
    { code: "GLBT", name: "Globetrotter" },
    { code: "DOCV", name: "Docsville" },
    { code: "PULS", name: "Wild Stuff" },
    { code: "CTS1", name: "無線衛星亞洲台" },
    { code: "FBX", name: "FashionBox" },
    { code: "CMEZ", name: "Mezzo Live" },
    { code: "TRUR", name: "TRACE Urban" },
    { code: "CONC", name: "Concerto" },
    { code: "NSWD", name: "NewsWorld" },
    { code: "CTSN", name: "無線衛星新聞台" },
    { code: "CJAZ", name: "半島電視台英語頻道" },
    { code: "CF24", name: "France 24" },
    { code: "CDW1", name: "DW" },
    { code: "CNHK", name: "NHK World-Japan" },
    { code: "CARI", name: "Arirang TV" },
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
    { code: "LNH", name: "Love Nature" },
    { code: "PCC", name: "鳳凰衛視中文台" },
    { code: "PIN", name: "鳳凰衛視資訊台" },
    { code: "PHK", name: "鳳凰衛視香港台" },
    { code: "J", name: "翡翠台" },
    { code: "TVG", name: "黃金翡翠台" },
    { code: "CTVE", name: "娛樂新聞台" },
    { code: "SGOL", name: "SUPER金曲" },
    { code: "SMUS", name: "SUPER Music" },
    { code: "SEYT", name: "SUPER EYT" },
    { code: "CWIN", name: "SUPER FREE" },
    { code: "SVAR", name: "SUPER獎門人" },
    { code: "SFOO", name: "SUPER識食" },
    { code: "STRA", name: "SUPER識嘆" },
    { code: "SSIT", name: "SUPER煲劇" },
    { code: "STVM", name: "SUPER單元劇" },
    { code: "SDOC", name: "真情SUPER煲" },
    { code: "SSPT", name: "SUPER Sports" },
    { code: "C18", name: "myTV SUPER 18台" },
    { code: "CCNA", name: "亞洲新聞台" },
    { code: "CRE", name: "創世電視" },
    { code: "NOWR", name: "NOW ROCK" },
    { code: "NOW7", name: "NOW 70s" },
    { code: "NOW8", name: "NOW 80s" },
    { code: "NOW9", name: "NOW 90s00s" },
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
