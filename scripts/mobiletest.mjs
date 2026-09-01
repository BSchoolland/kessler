import { chromium, devices } from "playwright";
const browser = await chromium.launch({ executablePath: "/usr/bin/google-chrome" });
const context = await browser.newContext({ ...devices["iPhone 13 landscape"], hasTouch: true });
const page = await context.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
await page.goto("http://localhost:3006/kessler/?seed=5", { waitUntil: "networkidle" });
await page.screenshot({ path: ".playtest/mobile-menu.png" });
await page.tap("#btn-play");
await page.waitForTimeout(500);
// left stick drag + swing taps
const vp = page.viewportSize();
await page.touchscreen.tap(vp.width * 0.2, vp.height * 0.7);
await page.waitForTimeout(300);
for (let i = 0; i < 6; i++) { await page.tap("#t-attack"); await page.waitForTimeout(400); }
await page.tap("#t-dash");
await page.waitForTimeout(1500);
await page.screenshot({ path: ".playtest/mobile-play.png" });
const info = await page.evaluate(() => ({ touchShown: !document.getElementById("touch").classList.contains("hidden"), hp: document.getElementById("hp-text").textContent, score: document.getElementById("score").textContent }));
console.log(info, errors.length ? errors : "no errors");
await browser.close();
