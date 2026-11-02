// Where does a single navigation's time actually GO?
// Traces one tab click: when each resource arrived, and when the destination hero painted.
import puppeteer from "puppeteer-core";

const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const BASE = process.argv[2];
const HREF = process.argv[3] || "/pro";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const run = async () => {
  const browser = await puppeteer.launch({
    executablePath: CHROME, headless: "new",
    args: ["--no-sandbox"], defaultViewport: { width: 1440, height: 900 },
  });
  const page = await browser.newPage();
  const cdp = await page.createCDPSession();
  await cdp.send("Network.enable");
  await cdp.send("Network.emulateNetworkConditions", {
    offline: false, latency: 40,
    downloadThroughput: (10 * 1024 * 1024) / 8, uploadThroughput: (3 * 1024 * 1024) / 8,
  });
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });

  await page.goto(BASE + "/home", { waitUntil: "networkidle2", timeout: 60000 });
  await sleep(1200);

  const trace = await page.evaluate(async (href) => {
    const prevHero = (() => {
      const h = [...document.querySelectorAll('h1,h2')].find((x) => {
        const r = x.getBoundingClientRect(), cs = getComputedStyle(x);
        return r.width > 0 && r.top < innerHeight && r.bottom > 0 && cs.opacity !== '0' && (x.textContent||'').trim().length > 6;
      });
      return h ? h.textContent.trim().slice(0,48) : null;
    })();
    const t0 = performance.now();
    const nBefore = performance.getEntriesByType('resource').length;
    document.querySelector(`a[href="${href}"]`).dispatchEvent(new MouseEvent('click', {bubbles:true,cancelable:true,view:window}));

    let heroAt = null, heroText = null;
    await new Promise((resolve) => {
      const tick = () => {
        const h = [...document.querySelectorAll('h1,h2')].find((x) => {
          const r = x.getBoundingClientRect(), cs = getComputedStyle(x);
          return r.width > 0 && r.top < innerHeight && r.bottom > 0 && cs.opacity !== '0' && (x.textContent||'').trim().length > 6;
        });
        const txt = h ? h.textContent.trim().slice(0,48) : null;
        if (txt && txt !== prevHero && heroAt === null) { heroAt = +(performance.now()-t0).toFixed(1); heroText = txt; return resolve(); }
        if (performance.now() - t0 > 9000) return resolve();
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
    await new Promise((r) => setTimeout(r, 400));
    const added = performance.getEntriesByType('resource').slice(nBefore).map((r) => ({
      u: r.name.split('/').pop().slice(0, 36),
      kind: r.initiatorType,
      startMs: +(r.startTime - t0).toFixed(1),
      endMs: +(r.responseEnd - t0).toFixed(1),
      kb: Math.round((r.encodedBodySize || 0) / 1024),
    })).sort((a, b) => a.endMs - b.endMs);
    return { prevHero, heroAt, heroText, added };
  }, HREF);

  await browser.close();
  console.log(`\n=== ${HREF}  (throttled 40ms / 10Mbps / 4x CPU) ===`);
  console.log(`destination hero painted at ${trace.heroAt}ms  — "${trace.heroText}"`);
  console.log(`\nrequests triggered by the click (${trace.added.length}):`);
  console.log("  start     end    size  kind       file");
  for (const r of trace.added)
    console.log(`  ${String(r.startMs).padStart(7)} ${String(r.endMs).padStart(7)} ${String(r.kb+'KB').padStart(7)}  ${r.kind.padEnd(10)} ${r.u}`);
  const js = trace.added.filter((r) => r.kind === "script");
  if (js.length) console.log(`\nlast JS chunk arrived at ${Math.max(...js.map((r) => r.endMs))}ms; hero at ${trace.heroAt}ms`);
};

run().catch((e) => { console.error(e); process.exit(1); });
