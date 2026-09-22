// README 截图：对着跑在 3000 端口、连着 prisma/demo.db（虚构数据）的 dev 服务器拍五页，写进 docs/images。
//
// 跑法：preview_start "career-agent-demo"（或 DATABASE_URL=file:./prisma/demo.db npm run dev），然后
//   node scripts/readme-shots.mjs
// 为什么不用 msedge --screenshot：那条路径下 G6 画布（能力画像）画不出来、Recharts 的 ResizeObserver 也没跑完；
// 走 DevTools 协议等页面真正稳定后 Page.captureScreenshot 就都正常。clip 直接裁掉 240px 侧栏，2 倍缩放，浅色主题。
import { spawn } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const BASE = process.env.README_SHOTS_BASE ?? "http://localhost:3000";
const EDGE = process.env.README_SHOTS_BROWSER ?? String.raw`C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe`;
const PORT = 9333;
const SIDEBAR = 240;
const WIDTH = 1280;
/** README 用浅色版（README_SHOTS_THEME=dark 可切深色）。 */
const THEME = process.env.README_SHOTS_THEME === "dark" ? "dark" : "light";
/** 页面 → 输出名、视口高度、等待毫秒（图谱要等 G6 分包与布局）。README 里同一行的两张图高度必须一致，否则表格错位。 */
const PAGES = [
  { name: "dashboard", path: "/", height: 1250, wait: 8000 },
  { name: "applications", path: "/applications", height: 1250, wait: 8000 },
  { name: "interview-history", path: "/interviews/history", height: 740, wait: 8000 },
  { name: "interview-review", path: "/interviews/review", height: 720, wait: 8000 },
  { name: "ability-profile", path: "/interviews/profile", height: 720, wait: 15000 },
];

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const browser = spawn(EDGE, [
  "--headless=new", "--hide-scrollbars", `--remote-debugging-port=${PORT}`,
  `--user-data-dir=${mkdtempSync(join(tmpdir(), "readme-shots-"))}`,
  `--window-size=${WIDTH},1400`, "--force-device-scale-factor=2", "about:blank",
], { stdio: "ignore" });

async function pageTarget() {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try {
      const targets = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json();
      const page = targets.find((target) => target.type === "page");
      if (page) return page;
    } catch { /* 浏览器还没起来 */ }
    await sleep(200);
  }
  throw new Error("headless browser did not expose a page target");
}

try {
  const ws = new WebSocket((await pageTarget()).webSocketDebuggerUrl);
  await new Promise((resolve) => { ws.onopen = resolve; });
  let nextId = 0;
  const pending = new Map();
  ws.onmessage = (event) => {
    const message = JSON.parse(event.data);
    if (message.id && pending.has(message.id)) { pending.get(message.id)(message); pending.delete(message.id); }
  };
  const send = (method, params = {}) => new Promise((resolve) => {
    const id = ++nextId; pending.set(id, resolve); ws.send(JSON.stringify({ id, method, params }));
  });

  await send("Page.enable");
  // 主题脚本读 localStorage 决定明暗；README 用浅色版，所以在任何页面脚本之前先写好偏好。
  await send("Page.addScriptToEvaluateOnNewDocument", {
    source: `try { localStorage.setItem("career-agent-theme", ${JSON.stringify(THEME)}); } catch {}`,
  });
  for (const page of PAGES) {
    await send("Emulation.setDeviceMetricsOverride", { width: WIDTH, height: page.height, deviceScaleFactor: 2, mobile: false });
    const nav = await send("Page.navigate", { url: `${BASE}${page.path}` });
    if (nav.error) throw new Error(`${page.path}: ${nav.error.message}`);
    await sleep(page.wait);
    const { result } = await send("Page.captureScreenshot", {
      format: "png",
      clip: { x: SIDEBAR, y: 0, width: WIDTH - SIDEBAR, height: page.height, scale: 1 },
    });
    const file = join("docs", "images", `${page.name}.png`);
    writeFileSync(file, Buffer.from(result.data, "base64"));
    console.log(`${file} ← ${page.path}`);
  }
  ws.close();
} finally {
  browser.kill();
}
