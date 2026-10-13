// Measure CLIENT-SIDE navigation on the marketing site, in a real Chrome that paints.
//
// Lighthouse measures document loads; it cannot see an SPA tab click. This drives the real
// nav and samples on every animation frame:
//   feedbackMs  — URL/nav state changed (did the click acknowledge at all)
//   contentMs   — the destination's hero text is on screen, visible, non-empty
//   blankFrames — frames where a full-screen EMPTY element covered the viewport centre
//                 (the Suspense fallback sheet). elementFromPoint, so an off-screen
//                 overlay cannot be mistaken for a cover.
import puppeteer from "puppeteer-core";

const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const BASE = process.argv[2];
const LABEL = process.argv[3] || BASE;
const TABS = ["/pro", "/conference-mode", "/investor", "/pricing", "/get-the-app"];

const PROBE = `
window.__nav = null;
window.__startProbe = (expectPath, previousHero) => {
  const t0 = performance.now();
  // previousHero is the hero that was on screen BEFORE the click. Keeping the outgoing page
  // mounted is the whole point of the transition, so "a hero is visible" is no longer proof
  // that the DESTINATION arrived — the old one is still there and would satisfy it. The
  // destination counts only once the hero text has actually CHANGED.
  const P = { feedbackMs: null, contentMs: null, blankFrames: 0, frames: 0, done: false, previousHero };
  window.__nav = P;
  const covered = () => {
    const el = document.elementFromPoint(innerWidth/2, innerHeight/2);
    if (!el) return true;
    const cs = getComputedStyle(el), r = el.getBoundingClientRect();
    return cs.position === 'fixed' && el.children.length === 0 &&
           r.width >= innerWidth - 2 && r.height >= innerHeight - 2;
  };
  const heroUp = () => {
    const h = [...document.querySelectorAll('h1,h2')].find(x => {
      const r = x.getBoundingClientRect(), cs = getComputedStyle(x);
      return r.width > 0 && r.height > 0 && r.top < innerHeight && r.bottom > 0 &&
             cs.opacity !== '0' && cs.visibility !== 'hidden' && (x.textContent||'').trim().length > 6;
    });
    return h ? h.textContent.trim().slice(0,48) : null;
  };
  const tick = () => {
    P.frames++;
    if (P.feedbackMs === null && location.pathname === expectPath) P.feedbackMs = +(performance.now()-t0).toFixed(1);
    if (covered()) P.blankFrames++;
    if (P.contentMs === null && location.pathname === expectPath) {
      const h = heroUp();
      if (h && h !== previousHero) { P.contentMs = +(performance.now()-t0).toFixed(1); P.hero = h; }
    }
    if (performance.now() - t0 > 9000 || (P.contentMs !== null && performance.now()-t0 > P.contentMs + 450)) { P.done = true; return; }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
};
`;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const run = async () => {
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: "new",
    args: ["--no-sandbox", "--window-size=1440,900"],
    defaultViewport: { width: 1440, height: 900 },
  });
  const page = await browser.newPage();
  await page.evaluateOnNewDocument(PROBE);

  // Throttle, or localhost proves nothing: with a 0ms chunk fetch the Suspense fallback
  // never gets a chance to appear, and the old and new code measure identically. These
  // are Lighthouse's own desktop-ish numbers — a real connection and a real machine, not
  // a loopback socket. THROTTLE=0 in the environment turns it off.
  if (process.env.THROTTLE !== "0") {
    const cdp = await page.createCDPSession();
    await cdp.send("Network.enable");
    await cdp.send("Network.emulateNetworkConditions", {
      offline: false,
      latency: 40,                       // ms RTT
      downloadThroughput: (10 * 1024 * 1024) / 8,   // 10 Mbps
      uploadThroughput: (3 * 1024 * 1024) / 8,
    });
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
  }

  const rows = [];
  const measure = async (href, note) => {
    const prevHero = await page.evaluate(() => {
      const h = [...document.querySelectorAll('h1,h2')].find((x) => {
        const r = x.getBoundingClientRect(), cs = getComputedStyle(x);
        return r.width > 0 && r.height > 0 && r.top < innerHeight && r.bottom > 0 &&
               cs.opacity !== '0' && cs.visibility !== 'hidden' && (x.textContent || '').trim().length > 6;
      });
      return h ? h.textContent.trim().slice(0, 48) : null;
    });
    await page.evaluate((p, prev) => window.__startProbe(p, prev), href, prevHero);
    await page.evaluate((h) => {
      const a = document.querySelector(`a[href="${h}"]`);
      a.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, view: window }));
    }, href);
    for (let i = 0; i < 120; i++) {
      const done = await page.evaluate(() => window.__nav && window.__nav.done);
      if (done) break;
      await sleep(100);
    }
    const r = await page.evaluate(() => window.__nav);
    rows.push({ tab: href, note, ...r });
  };

  // FIRST VISIT to each tab, always starting from a freshly loaded home page (cold chunk).
  for (const href of TABS) {
    await page.goto(BASE + "/home", { waitUntil: "networkidle2", timeout: 60000 });
    await sleep(900);
    await measure(href, "first visit");
  }

  // RETURN visit: home -> investor -> home -> investor (chunk already in memory).
  await page.goto(BASE + "/home", { waitUntil: "networkidle2", timeout: 60000 });
  await sleep(900);
  await measure("/investor", "warm (1st)");
  await page.evaluate(() => {
    document.querySelector('a[href="/home"]').dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, view: window }));
  });
  await sleep(900);
  await measure("/investor", "warm (return)");

  await browser.close();

  console.log("\n=== " + LABEL + " ===");
  console.log("tab               state           feedback   content    blank frames");
  for (const r of rows) {
    const blank = `${r.blankFrames}/${r.frames}`;
    console.log(
      `${r.tab.padEnd(18)}${String(r.note).padEnd(16)}${String(r.feedbackMs ?? "—").padStart(8)}ms${String(r.contentMs ?? "—").padStart(9)}ms${blank.padStart(14)}`
    );
  }
  const firsts = rows.filter((r) => r.note === "first visit");
  console.log("\nfirst-visit content  mean " + Math.round(firsts.reduce((s,r)=>s+(r.contentMs||0),0)/firsts.length) + "ms   worst " + Math.max(...firsts.map(r=>r.contentMs||0)) + "ms");
  console.log("total blank frames   " + rows.reduce((s,r)=>s+r.blankFrames,0) + " of " + rows.reduce((s,r)=>s+r.frames,0));
};

run().catch((e) => { console.error(e); process.exit(1); });
