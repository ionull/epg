const core = require("@actions/core");
const axios = require("axios");
const cheerio = require("cheerio");
const dayjs = require("dayjs");
const fs = require("fs-extra");
const zlib = require("zlib");
const utc = require("dayjs/plugin/utc");
const timezone = require("dayjs/plugin/timezone");

dayjs.extend(utc);
dayjs.extend(timezone);

const BASE_TZ = "Asia/Shanghai";

function getBaseMonday() {
  const now = dayjs().tz(BASE_TZ);
  const baseMon = now.day() === 0
    ? now.subtract(6, 'day').startOf('day')
    : now.startOf('week').add(1, 'day');
  return baseMon;
}

const CHANNEL_GROUP = core.getInput("channel_group");
const CHANNEL_ID = core.getInput("channel_id");
const DISPLAY_NAME = core.getInput("display_name");
const OUTPUT_PATH = core.getInput("output_path");
const SUFFIX_PATH = core.getInput("suffix_path");

const combinedChannelId = [CHANNEL_GROUP, CHANNEL_ID].filter(val => val != null && val.trim() !== "").join('-');

const USER_AGENT = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:148.0) Gecko/20100101 Firefox/148.0";
const REFERER = "https://www.tvmao.com/"
const COOKIE = 'Hm_lvt_c0bdbfd2760344b657ca669278f8a772=1771864101; HMACCOUNT=5A40FE2B0C16E872; _ga=GA1.1.874070911.1771864102; xsuid=e7508145-b5a5-4b2a-a1e2-8092fd347670; xsuid_time=2026-2-24; tvm_channel_province=BTV@; say=ok; Hm_lpvt_c0bdbfd2760344b657ca669278f8a772=1773133174; _ga_53NZR5KP7Q=GS2.1.s1773133174$o28$g1$t1773133176$j58$l0$h0; _ga_BX824P6FEQ=GS2.1.s1773133174$o28$g1$t1773133176$j58$l0$h0'

const fetchHtml = async (w) => {
  const url = `https://www.tvmao.com/program${SUFFIX_PATH}/${combinedChannelId}-w${w}.html`;
  console.log('fetchHtml', url)
  const { data } = await axios.get(url, {
    headers: { 
      //'Referer': REFERER,
      "User-Agent": USER_AGENT,
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8', 
      'Accept-Language': 'zh-CN,zh;q=0.9,zh-TW;q=0.8,zh-HK;q=0.7,en-US;q=0.6,en;q=0.5', 
      'Accept-Encoding': 'gzip, deflate, br, zstd', 
      'Connection': 'keep-alive', 
      'Upgrade-Insecure-Requests': '1', 
      'Sec-Fetch-Dest': 'document', 
      'Sec-Fetch-Mode': 'navigate', 
      'Sec-Fetch-Site': 'none', 
      'Sec-Fetch-User': '?1', 
      'Priority': 'u=0, i', 
      'Pragma': 'no-cache', 
      'Cache-Control': 'no-cache',
      'Cookie': COOKIE
    },
    decompress: true
  });
  //console.log('fetchHtml', data)
  return cheerio.load(data);
};

const fetchChannelEpg = async (w) => {
  const page_url = `https://www.tvmao.com/program${SUFFIX_PATH}/${combinedChannelId}-w${w}.html`;
  const urlToken = "https://www.tvmao.com/servlet/accessToken?p=channelEpg";
  const tokenData = await axios.get(urlToken, {
    headers: {
      "User-Agent": USER_AGENT,
      Referer: REFERER,
    },
  });

  const url = "https://www.tvmao.com/servlet/channelEpg";
  const { data } = await axios.post(
    url,
    new URLSearchParams({
      tc: CHANNEL_GROUP,
      cc: CHANNEL_ID,
      w,
      token: tokenData.data[1],
    }),
    {
      headers: {
        "User-Agent": USER_AGENT,
        Referer: REFERER,
        "Content-Type": "application/x-www-form-urlencoded",
      },
    }
  );
  return data[1] || "";
};

function extractTime(item, $) {
  return $(item)
    .find(".am, .pm")
    .contents()
    .filter((_, node) => node.type === "text")
    .text()
    .trim();
}

function parsePrograms($, dayIndex, query) {
  const programs = [];
  const items = $(query).toArray().filter(item => item.children[1]);
  const baseMon = getBaseMonday();

  for (let i = 0; i < items.length; i++) {
    const timeText = extractTime(items[i], $);
    const title = $(items[i]).find(".p_show").text().trim().replace(/\s+/g, " ");
    if (!timeText || !title) continue;

    const [h, m] = timeText.split(":").map(Number);
    const start = baseMon.add(dayIndex, "day").hour(h).minute(m).second(0);

    let stop;
    if (i + 1 < items.length) {
      const nextTimeText = extractTime(items[i + 1], $);
      if (nextTimeText) {
        const [nh, nm] = nextTimeText.split(":").map(Number);
        stop = baseMon.add(dayIndex, "day").hour(nh).minute(nm).second(0);
        if (stop.isBefore(start)) stop = stop.add(1, "day");
      } else {
        stop = start.add(1, "hour");
      }
    } else {
      stop = start.add(1, "hour");
    }

    programs.push({ start, stop, title });
  }
  return programs;
}

function fixCrossWeekStopTimes(programsPerWeek) {
  for (let i = 0; i < programsPerWeek.length - 1; i++) {
    const currentWeek = programsPerWeek[i];
    const nextWeek = programsPerWeek[i + 1];

    if (currentWeek.length === 0 || nextWeek.length === 0) continue;

    const lastProgram = currentWeek[currentWeek.length - 1];
    const firstNextProgram = nextWeek[0];

    if (firstNextProgram.start.isBefore(lastProgram.start)) {
      firstNextProgram.start = firstNextProgram.start.add(1, "day");
    }

    lastProgram.stop = firstNextProgram.start;
  }
}

const buildXml = (programs) => {
  const channelXml = `<channel id="${DISPLAY_NAME}">
  <display-name>${DISPLAY_NAME}</display-name>
</channel>\n`;

  const programXml = programs
    .sort((a, b) => a.start - b.start)
    .map(
      (p) => `<programme start="${p.start.format("YYYYMMDDHHmmss")} +0800" stop="${p.stop.format("YYYYMMDDHHmmss")} +0800" channel="${DISPLAY_NAME}">
  <title>${p.title}</title>
</programme>`
    )
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>\n<tv>\n${channelXml}${programXml}\n</tv>\n`;
};

const main = async () => {
  try {
    let programsPerWeek = [];

    for (let w = 1; w <= 7; w++) {
      const $html = await fetchHtml(w);

      const additionalHtml = "";//await fetchChannelEpg(w);
      if (additionalHtml.trim().startsWith("<li")) {
        $html("#pgrow").append(additionalHtml);
      }

      const weekPrograms = parsePrograms($html, w - 1, "#pgrow li");
      programsPerWeek.push(weekPrograms);
    }

    fixCrossWeekStopTimes(programsPerWeek);

    const allPrograms = programsPerWeek.flat();

    const xml = buildXml(allPrograms);

    const compressed = zlib.gzipSync(Buffer.from(xml, "utf-8"));

    await fs.ensureDir("parts");
    await fs.writeFile(OUTPUT_PATH, compressed);

    console.log("Generated:", OUTPUT_PATH);
  } catch (error) {
    core.setFailed(error.message);
  }
};

main();
