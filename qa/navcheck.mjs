import puppeteer from "puppeteer-core";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", args: ["--no-sandbox"] });
for (const [label, w, h, mob] of [["mobile 390", 390, 844, true], ["desktop 1680", 1680, 1050, false]]) {
  const p = await b.newPage(); await p.setViewport({ width: w, height: h, deviceScaleFactor: 2, isMobile: mob, hasTouch: mob });
  if (mob) await p.setUserAgent("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1");
  await p.setCacheEnabled(false);
  await p.goto("http://localhost:5197/pricing", { waitUntil: "networkidle2", timeout: 45000 });
  await sleep(3000);
  const m = await p.evaluate(() => {
    const hd = document.querySelector("header"); const wm = document.querySelector(".mx-wordmark-text");
    const bg = document.querySelector(".mx-nav-burger");
    return { navH: Math.round(hd.getBoundingClientRect().height),
      wordmark: wm ? getComputedStyle(wm).fontSize : null,
      burger: bg ? Math.round(bg.getBoundingClientRect().width)+"x"+Math.round(bg.getBoundingClientRect().height) : "n/a" };
  });
  console.log(label.padEnd(14), JSON.stringify(m));
  await p.close();
}
await b.close();
