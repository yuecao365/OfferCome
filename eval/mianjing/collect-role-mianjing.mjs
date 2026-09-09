import { promises as fs } from "node:fs";
import path from "node:path";

const ROOT = path.resolve("eval/mianjing");
const RAW_DIR = path.join(ROOT, "raw");
const REPORT = path.join(ROOT, "collection-roles-2025-2026.md");
const SEARCH_API = "https://gw-c.nowcoder.com/api/sparta/pc/search";
const DETAIL_API = "https://gw-c.nowcoder.com/api/sparta/detail/content-data/detail";
const MOMENT_DETAIL_API = "https://gw-c.nowcoder.com/api/sparta/detail/moment-data/detail";
const TARGET = 20;
const MINIMUM = 15;

const roles = [
  {
    role: "ai-llm",
    queries: ["AI应用开发 面经", "Agent 开发 面经", "RAG 开发 面经", "大模型应用开发 面经", "LLM 应用 面经", "AI工程 面经"],
    titleMatch: /(?:AI\s*应用|大模型应用|LLM|Agent|RAG|智能体).*(?:面经|面试|一面|二面|三面)|(?:面经|面试).*(?:AI\s*应用|大模型应用|LLM|Agent|RAG|智能体)/i,
    titleReject: /(?:算法工程师|算法岗|机器学习|前端|测试开发|测开|SRE|运维)/i,
    manualCandidates: [
      "40920533fad14136bff01c3928c7e953",
      "8a553bb6ea8445d0b0abe11e87614cea",
      "632b151ada3a404894f1dc1c30dcbd19",
      "d73020680b3b42c3ac579e2f25721d90",
      "77a81a03b55143c89d1caf76833676d9",
      "d770696f3495465d9e3d40c3d631d54c",
      "10b2fcaf73d2401f8636bd0459e1cd08",
      "c759a618d89d49be897af49dbc961241",
      "7a0ddb8e077041d4b72ba9e5290ad36a",
      "b0a0fc09ba0b408c9df84d38c6d1eb83",
      "144c6ae334b24c0aa643ed43ccfebaac",
      "62d4ca9866d84d63bf6eafbb0a947bb8",
      "9c23964be69d4cd19f38b1b1e74cd177",
      "66e688eed16e4708af18c3a5efdb62b3",
      "f5f1a4daff104fcb8c48476ed9c99f39",
      "708ff271220c4ccf86da290e265dfc4a",
      "505159fb5f874d909c0c252f3f959ea0",
      "b62416eaa3764a9ba46269c0058019fd",
      "0619e2e8689e45df84ad36de9d96221d",
      "e3595a3166624f1785b379ee0bcda08e",
    ],
  },
  {
    role: "frontend",
    queries: ["前端开发 面经", "Web前端 面经", "React 前端 面经", "Vue 前端 面经", "前端实习 面经", "前端工程师 面试"],
    titleMatch: /(?:前端|Web前端|React|Vue).*(?:面经|面试|一面|二面|三面|实习)|(?:面经|面试).*(?:前端|Web前端|React|Vue)/i,
    titleReject: /(?:测试开发|测开|SRE|运维|算法工程师|机器学习)/i,
    manualCandidates: [
      "d5d1ae859e174c00b61940241bb8afac",
      "89e1ca097f38416c8fbc4ce8a53da77f",
      "9d0912fb61294019874e8a4df1534a3e",
      "7bf8d4ba32c745fd96e70dfc3ed4dd59",
      "2deffcdd02a04383bfdb0f48e5c95661",
      "89b9a26dfd234758979597c5370f03ee",
    ],
  },
  {
    role: "test-qa",
    queries: ["测试开发 面经", "测开 面经", "测试开发实习 面经", "QA 面经", "软件测试 面经", "AI评测 面经"],
    titleMatch: /(?:测试开发|测开|QA|软件测试|测试工程师|AI\s*评测|大模型评测).*(?:面经|面试|一面|二面|三面|实习)|(?:面经|面试).*(?:测试开发|测开|QA|软件测试|测试工程师|AI\s*评测|大模型评测)/i,
    titleReject: /(?:前端|SRE|运维|算法工程师|机器学习)/i,
    manualCandidates: [
      "3585ae097707492a93df7d12d3e3c6a6",
      "17c429101bf944dbab8fb087cd851fab",
      "76a638264e2b464a895c48a06daa03fe",
      "107237e2ef014f069b487caac613e056",
    ],
  },
  {
    role: "infra",
    queries: ["SRE 面经", "运维开发 面经", "运维工程师 面经", "运维 面经", "云原生 面经", "云计算 面经", "云计算开发 面经", "云平台 面经", "基础架构 面经", "基础平台 面经", "稳定性工程师 面经", "AI Infra 面经", "K8s 面经", "Kubernetes 面经", "容器平台 面经", "容器开发 面经", "DevOps 面经", "PaaS 面经", "IaaS 面经"],
    titleMatch: /(?:SRE|运维(?:开发|工程师|交付实施)?|云原生|云计算(?:开发|工程师|岗|方向)|云平台|基础架构|基础平台|稳定性工程师|AI\s*Infra|K8s|Kubernetes|容器(?:平台|开发)|DevOps|PaaS|IaaS).*(?:面经|面试|一面|二面|三面|实习)|(?:面经|面试|一面|二面|三面).*(?:SRE|运维(?:开发|工程师|交付实施)?|云原生|云计算(?:开发|工程师|岗|方向)|云平台|基础架构|基础平台|稳定性工程师|AI\s*Infra|K8s|Kubernetes|容器(?:平台|开发)|DevOps|PaaS|IaaS)/i,
    titleReject: /(?:前端|测试开发|测开|算法工程师|机器学习|大数据|数据开发|安全工程|客户端|Java后端|后端开发)/i,
    manualCandidates: [
      "725796328210440192", "723877059239346176", "908367488235110400", "900346960249376768",
      "e2a502f37ad04bbabdb760e5925a1716", "4ffd9899c60f4f9d9a6eae0d5d1c8d31",
      "caf9e36332c1426fa3617d39ab63d657", "3c17ca1367ed4e69a17cf6b36684c6fd",
      "60b857032ad44fecbd564f7844982c19", "ec6ec908bade410db2c81f9c8a8ecbbc",
      "b9bb9f7f5b15414fab13105bbe1796a9", "ffaebe5f4af1469b92b6e884aa6ddb5d",
      "4d718d8facd74c18a3ce5a9e263b8334", "a3b91ccae5164dae87d332e6f0d8fb13",
      "c0597d0b13c14871b50fd2d223a3b916", "0b99f63bd74c4a52ad17159542e890ad",
      "df26697b72594e0d9745fcb19ec9f712", "7dbec8b42bba46e1b74dc176ff2c8a03",
      "e2cbe7e87106489e882b95afac2b5419",
    ],
  },
];

const companies = [
  [/(?:DeepSeek)/i, "DeepSeek", "deepseek"],
  [/(?:长鑫存储|长鑫)/i, "长鑫存储", "changxin"],
  [/(?:月之暗面|Moonshot)/i, "月之暗面", "moonshot"],
  [/(?:影石|Insta360)/i, "影石", "insta360"],
  [/(?:观远数据|观远)/i, "观远数据", "guanyuan"],
  [/(?:波克城市|波克)/i, "波克城市", "boke"],
  [/(?:共济科技|共济)/i, "共济科技", "gongji"],
  [/(?:晓多科技|晓多)/i, "晓多科技", "xiaoduo"],
  [/(?:尹硕科技|尹硕)/i, "尹硕科技", "yinshuo"],
  [/(?:中孚信息|中孚)/i, "中孚信息", "zhongfu"],
  [/(?:游卡)/i, "游卡", "youka"],
  [/(?:咪咕)/i, "咪咕", "migu"],
  [/(?:小西科技|小西)/i, "小西科技", "xiaoxi"],
  [/(?:分子之心)/i, "分子之心", "fenzi"],
  [/(?:青藤云)/i, "青藤云", "qingteng"],
  [/(?:乐企)/i, "乐企", "leqi"],
  [/(?:宝宝巴士)/i, "宝宝巴士", "baobaobashi"],
  [/(?:旷视科技|旷视)/i, "旷视科技", "megvii"],
  [/(?:多益网络|多益)/i, "多益网络", "duoyi"],
  [/(?:人人租)/i, "人人租", "renrenzu"],
  [/(?:即使设计)/i, "即使设计", "jishi"],
  [/(?:锐明技术|锐明)/i, "锐明技术", "streamax"],
  [/(?:小赢科技|小赢)/i, "小赢科技", "xiaoying"],
  [/(?:知乎)/i, "知乎", "zhihu"],
  [/(?:安软)/i, "安软", "anruan"],
  [/(?:腾讯音乐|酷狗)/i, "腾讯音乐", "tencentmusic"],
  [/(?:字节跳动|字节|抖音)/i, "字节跳动", "bytedance"],
  [/(?:阿里巴巴|阿里云|阿里|淘天|淘宝|钉钉)/i, "阿里巴巴", "alibaba"],
  [/(?:蚂蚁集团|蚂蚁)/i, "蚂蚁集团", "ant"],
  [/(?:腾讯|微信|腾讯云)/i, "腾讯", "tencent"],
  [/(?:美团)/i, "美团", "meituan"],
  [/(?:拼多多|PDD)/i, "拼多多", "pinduoduo"],
  [/(?:快手)/i, "快手", "kuaishou"],
  [/(?:百度)/i, "百度", "baidu"],
  [/(?:小红书)/i, "小红书", "xiaohongshu"],
  [/(?:京东)/i, "京东", "jd"],
  [/(?:滴滴)/i, "滴滴", "didi"],
  [/(?:网易|雷火|互娱)/i, "网易", "netease"],
  [/(?:小米)/i, "小米", "xiaomi"],
  [/(?:Shopee|虾皮)/i, "Shopee", "shopee"],
  [/(?:华为)/i, "华为", "huawei"],
  [/(?:哔哩哔哩|B站|bilibili)/i, "哔哩哔哩", "bilibili"],
  [/(?:携程)/i, "携程", "xiecheng"],
  [/(?:高德)/i, "高德", "amap"],
  [/(?:OPPO)/i, "OPPO", "oppo"],
  [/(?:vivo)/i, "vivo", "vivo"],
  [/(?:小鹏)/i, "小鹏", "xiaopeng"],
  [/(?:理想汽车|理想)/i, "理想汽车", "lixiang"],
  [/(?:蔚来)/i, "蔚来", "nio"],
  [/(?:第四范式)/i, "第四范式", "4paradigm"],
  [/(?:MiniMax)/i, "MiniMax", "minimax"],
  [/(?:智谱)/i, "智谱", "zhipu"],
  [/(?:科大讯飞|讯飞)/i, "科大讯飞", "iflytek"],
  [/(?:京东方)/i, "京东方", "jingdongfang"],
  [/(?:欢聚|YY)/i, "欢聚", "huanju"],
  [/(?:360|奇虎)/i, "360", "qihu360"],
  [/(?:Soul)/i, "Soul", "soul"],
  [/(?:得物)/i, "得物", "dewu"],
  [/(?:去哪儿)/i, "去哪儿", "qunar"],
  [/(?:同程)/i, "同程", "tongcheng"],
  [/(?:富途)/i, "富途", "futu"],
  [/(?:联想)/i, "联想", "lenovo"],
  [/(?:金山)/i, "金山", "kingsoft"],
  [/(?:深信服)/i, "深信服", "sangfor"],
  [/(?:海康威视|海康)/i, "海康威视", "hikvision"],
  [/(?:大疆)/i, "大疆", "dji"],
  [/(?:米哈游)/i, "米哈游", "mihoyo"],
];

const excludedTitle = /(?:学习路线|培训|课程|资料包|资料分享|题库|面试题汇总|面经汇总|面经合集|全网最全|共建|招募|求职辅导|内推|招聘|岗位推荐|模拟|完整答案|全解析|通关手册|高频面试题|高频面试真题|超全整理|实战全攻略|半年总结|秋招总结|面试总结|面经总结|整理了一份|补一些.*面经|八股怎么准备|速通版|\d+题)/i;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function request(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      "user-agent": "Mozilla/5.0 interview-source-collector",
      origin: "https://www.nowcoder.com",
      referer: "https://www.nowcoder.com/search",
      accept: "application/json",
      ...(options.headers ?? {}),
    },
    signal: AbortSignal.timeout(45_000),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

async function search(query, page) {
  return request(SEARCH_API, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ type: "post", query, page }),
  });
}

async function detail(id, source) {
  return request(`${DETAIL_API}/${id}`, { headers: { referer: source } });
}

async function momentDetail(uuid, source) {
  return request(`${MOMENT_DETAIL_API}/${uuid}`, { headers: { referer: source } });
}

function timestampYear(value) {
  if (!Number.isFinite(Number(value))) return null;
  return new Date(Number(value)).getUTCFullYear();
}

function identifyCompany(text) {
  for (const [pattern, company, slug] of companies) {
    if (pattern.test(text)) return { company, slug };
  }
  return { company: "其他", slug: "other" };
}

function isRoleMatch(definition, title) {
  return definition.titleMatch.test(title)
    && !definition.titleReject.test(title)
    && !excludedTitle.test(title);
}

function isLikelyInterview(title, content) {
  if (!/(?:面经|面试|一面|二面|三面|终面|实习)/i.test(title)) return false;
  if (excludedTitle.test(title)) return false;
  if (/(?:广告|课程购买|加微信|付费咨询)/i.test(title)) return false;
  if ((content.match(/<h2[^>]*>\s*面经\s*0?\d/gi) ?? []).length >= 2) return false;
  if (/(?:最近按当前筛选整理|其余\s*\d+\s*题已省略|导读：|独家.*应答|避坑指南|免费分享.*知识库|内推简历|投递方式|大家投递完|面试内容分布|每家公司都会问|全国坑位)/i.test(content)) return false;
  return /(?:自我介绍|面试问题|面试内容|一面|二面|三面|问[:：]?|追问|手撕|项目)/i.test(content);
}

function yamlValue(value) {
  return String(value).replace(/[\r\n]+/g, " ").trim();
}

async function existingSources() {
  const files = (await fs.readdir(RAW_DIR)).filter((name) => name.endsWith(".md"));
  const sources = new Set();
  for (const file of files) {
    const text = await fs.readFile(path.join(RAW_DIR, file), "utf8");
    const source = text.match(/^source: (.+)$/m)?.[1]?.trim();
    if (source) sources.add(source.replace("api-cdn.nowcoder.com", "www.nowcoder.com").split("?")[0]);
  }
  return sources;
}

async function collectCandidates(definition) {
  const map = new Map();
  for (const identifier of definition.manualCandidates ?? []) {
    const isPost = /^\d+$/.test(identifier);
    const source = isPost
      ? `https://www.nowcoder.com/discuss/${identifier}`
      : `https://www.nowcoder.com/feed/main/detail/${identifier}`;
    map.set(source, { id: isPost ? identifier : "", uuid: isPost ? "" : identifier, source, title: "", snippet: "", approxYear: null, kind: isPost ? "post" : "moment", manual: true });
  }
  for (const query of definition.queries) {
    for (const year of [2026, 2025]) {
      for (let page = 1; page <= 5; page += 1) {
        try {
          const payload = await search(`${query} ${year}`, page);
          for (const record of payload?.data?.records ?? []) {
            const data = record?.contentData;
            const id = String(data?.id ?? "");
            const uuid = String(data?.uuid ?? "");
            const title = String(data?.title ?? "").trim();
            if (!/^\d+$/.test(id) || !/^[0-9a-f]{32}$/i.test(uuid) || !title || !isRoleMatch(definition, title)) continue;
            const source = `https://www.nowcoder.com/discuss/${id}`;
            const approxYear = timestampYear(data?.createTime ?? data?.showTime ?? data?.editTime);
            if (approxYear && ![2025, 2026].includes(approxYear)) continue;
            const candidate = { id, uuid, source, title, snippet: String(data?.content ?? ""), approxYear, kind: "post", manual: map.get(source)?.manual ?? false };
            const old = map.get(source);
            if (!old || candidate.snippet.length > old.snippet.length) map.set(source, candidate);
          }
        } catch (error) {
          process.stderr.write(`search failed\t${definition.role}\t${query}\t${year}\t${page}\t${error.message}\n`);
        }
        await sleep(80);
      }
    }
  }
  return [...map.values()].sort((a, b) => Number(b.manual) - Number(a.manual) || (b.approxYear ?? 0) - (a.approxYear ?? 0) || b.snippet.length - a.snippet.length);
}

async function main() {
  await fs.mkdir(RAW_DIR, { recursive: true });
  for (const filename of await fs.readdir(RAW_DIR)) {
    if (!/^(?:ai-llm|frontend|test-qa|infra)-.+\.md$/.test(filename)) continue;
    const target = path.resolve(RAW_DIR, filename);
    if (path.dirname(target) !== RAW_DIR) throw new Error(`拒绝删除目录外文件：${target}`);
    await fs.unlink(target);
  }
  await fs.rm(REPORT, { force: true });
  const seenSources = await existingSources();
  const candidateLists = new Map();
  for (const definition of roles) {
    const candidates = await collectCandidates(definition);
    candidateLists.set(definition.role, candidates);
    process.stdout.write(`candidates\t${definition.role}\t${candidates.length}\n`);
  }

  const selected = new Map(roles.map(({ role }) => [role, []]));
  const companyCounts = new Map(roles.map(({ role }) => [role, new Map()]));
  const titleKeys = new Map(roles.map(({ role }) => [role, new Set()]));
  const cursors = new Map(roles.map(({ role }) => [role, 0]));
  const skipped = [];

  async function addNext(definition) {
    const candidates = candidateLists.get(definition.role);
    while ((cursors.get(definition.role) ?? 0) < candidates.length) {
      const cursor = cursors.get(definition.role) ?? 0;
      const candidate = candidates[cursor];
      cursors.set(definition.role, cursor + 1);
      if (seenSources.has(candidate.source)) {
        skipped.push({ source: candidate.source, reason: "与已有 backend 或本轮条目重复" });
        continue;
      }

      let fetched = "link-only";
      let body = candidate.snippet;
      let title = candidate.title;
      let year = candidate.approxYear;
      let exactContent = "";
      try {
        const payload = candidate.kind === "moment"
          ? await momentDetail(candidate.uuid, candidate.source)
          : await detail(candidate.id, candidate.source);
        const data = payload?.data;
        if (!payload?.success || !data) throw new Error(payload?.msg || "正文不存在");
        if (candidate.kind === "moment" && String(data.uuid) !== candidate.uuid) throw new Error("正文 UUID 不匹配");
        if (candidate.kind !== "moment" && String(data.id) !== candidate.id) throw new Error("正文 ID 不匹配");
        title = String(data.title ?? title).trim();
        exactContent = typeof data.content === "string" ? data.content : "";
        body = exactContent || body;
        year = timestampYear(data.createdAt ?? data.createTime ?? data.showTime ?? data.editTime) ?? year;
        if (exactContent) fetched = "full";
      } catch (error) {
        skipped.push({ source: candidate.source, reason: `正文接口失败，保留搜索片段：${error.message}` });
      }

      if (![2025, 2026].includes(year)) {
        skipped.push({ source: candidate.source, reason: "发帖年份不是 2025/2026 或无法确认" });
        continue;
      }
      if (!isRoleMatch(definition, title)) {
        skipped.push({ source: candidate.source, reason: "正文标题与目标岗位不匹配" });
        continue;
      }
      if (!isLikelyInterview(title, body)) {
        skipped.push({ source: candidate.source, reason: "不像一次真实面试记录" });
        continue;
      }

      let companyInfo = identifyCompany(title);
      if (companyInfo.company === "其他" && !/(?:某|初创|小厂|中厂)/i.test(title)) companyInfo = identifyCompany(body.slice(0, 800));
      const counts = companyCounts.get(definition.role);
      if ((counts.get(companyInfo.company) ?? 0) >= 4) {
        skipped.push({ source: candidate.source, reason: `同方向 ${companyInfo.company} 已达到 4 篇` });
        continue;
      }
      const titleKey = title.toLocaleLowerCase().replace(/\s+/g, "");
      if (titleKeys.get(definition.role).has(titleKey)) {
        skipped.push({ source: candidate.source, reason: "同方向标题完全重复" });
        continue;
      }

      const companyIndex = (counts.get(companyInfo.company) ?? 0) + 1;
      const filename = `${definition.role}-${companyInfo.slug}-${String(companyIndex).padStart(2, "0")}.md`;
      const fileText = [
        `source: ${candidate.source}`,
        `company: ${companyInfo.company}`,
        `role: ${definition.role}`,
        `title: ${yamlValue(title)}`,
        `fetched: ${fetched}`,
        "---",
        body,
        "",
      ].join("\n");
      await fs.writeFile(path.join(RAW_DIR, filename), fileText, "utf8");
      counts.set(companyInfo.company, companyIndex);
      titleKeys.get(definition.role).add(titleKey);
      seenSources.add(candidate.source);
      selected.get(definition.role).push({ filename, company: companyInfo.company, source: candidate.source, fetched, chars: body.length, year, title });
      process.stdout.write(`saved\t${filename}\t${year}\t${fetched}\t${body.length}\n`);
      return true;
    }
    return false;
  }

  for (const phaseTarget of [MINIMUM, TARGET]) {
    let progress = true;
    while (progress && roles.some(({ role }) => selected.get(role).length < phaseTarget)) {
      progress = false;
      for (const definition of roles) {
        if (selected.get(definition.role).length >= phaseTarget) continue;
        if (await addNext(definition)) progress = true;
      }
    }
  }

  const lines = [
    "# 2025–2026 四方向公开面经收集清单",
    "",
    `生成时间：${new Date().toISOString()}`,
    "",
  ];
  for (const definition of roles) {
    const items = selected.get(definition.role);
    lines.push(`## ${definition.role}（${items.length} 篇）`, "", "| 文件名 | 公司 | 年份 | URL | fetched | 正文字数 |", "|---|---|---:|---|---|---:|");
    for (const item of items) lines.push(`| ${item.filename} | ${item.company} | ${item.year} | ${item.source} | ${item.fetched} | ${item.chars} |`);
    lines.push("");
  }
  lines.push("## 汇总", "");
  for (const definition of roles) lines.push(`- ${definition.role}: ${selected.get(definition.role).length}`);
  lines.push(`- 合计: ${roles.reduce((sum, definition) => sum + selected.get(definition.role).length, 0)}`, "", "## 跳过来源", "");
  const reasonCounts = new Map();
  for (const item of skipped) reasonCounts.set(item.reason, (reasonCounts.get(item.reason) ?? 0) + 1);
  for (const [reason, count] of [...reasonCounts].sort((a, b) => b[1] - a[1])) lines.push(`- ${reason}：${count}`);
  lines.push("", "### 跳过来源明细", "", "| URL | 原因 |", "|---|---|");
  for (const item of skipped) lines.push(`| ${item.source} | ${item.reason.replace(/\|/g, "\\|")} |`);
  lines.push("", "## 未收够方向", "");
  let shortageCount = 0;
  for (const definition of roles) {
    const count = selected.get(definition.role).length;
    if (count < TARGET) {
      lines.push(`- ${definition.role} 未达到目标 20 篇，当前 ${count} 篇。`);
      shortageCount += 1;
    }
  }
  if (shortageCount === 0) lines.push("- 无；四个方向均达到 20 篇目标。");
  await fs.writeFile(REPORT, `${lines.join("\n")}\n`, "utf8");
}

await main();
