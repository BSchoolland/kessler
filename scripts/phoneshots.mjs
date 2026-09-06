// Landscape-phone screenshots: menu, play, boss, tutorial, upgrade cards. node scripts/phoneshots.mjs [url]
import { chromium, devices } from "playwright";
const url = process.argv[2] ?? "http://localhost:3016/kessler/";
const browser = await chromium.launch({ executablePath: process.env.CHROME ?? "/usr/bin/google-chrome" });
const ctx = await browser.newContext({ ...devices["iPhone 13"], viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true });
const page = await ctx.newPage();
const errors = []; page.on("pageerror", (e) => errors.push(e.message));
const tapSel = async (sel) => { const b = await page.locator(sel).boundingBox(); await page.touchscreen.tap(b.x + b.width / 2, b.y + b.height / 2); };
async function open(query) {
  await page.goto(`${url}${query}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(400);
  await page.touchscreen.tap(8, 380);
  await page.waitForTimeout(250);
}
await open("");
await page.screenshot({ path: ".playtest/phone-menu.png" });
await open("?bot=1&god=1&seed=3");
await tapSel("#btn-play");
await page.waitForTimeout(5000);
await page.screenshot({ path: ".playtest/phone-play.png" });
// wait for the first upgrade screen
const t0 = Date.now();
while (Date.now() - t0 < 70000 && !(await page.locator("#offers:not(.hidden)").count())) await page.waitForTimeout(500);
await page.screenshot({ path: ".playtest/phone-offers.png" });
await open("?bot=1&god=1&wave=10&seed=4");
await tapSel("#btn-play");
await page.waitForTimeout(9000);
await page.screenshot({ path: ".playtest/phone-boss.png" });
await open("?tut=1");
await tapSel("#btn-tutorial");
await page.waitForTimeout(1500);
const b = await page.locator("#zone-l").boundingBox();
const cdp = await ctx.newCDPSession(page);
await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: b.x + 120, y: b.y + b.height - 90, id: 1 }] });
await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: b.x + 160, y: b.y + b.height - 90, id: 1 }] });
await page.waitForTimeout(500);
await page.screenshot({ path: ".playtest/phone-tutorial.png" });
await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
await page.waitForTimeout(400);
await page.screenshot({ path: ".playtest/phone-tutorial-still.png" });
console.log(errors.length ? "ERRORS: " + errors.join(" | ") : "no console errors");
await browser.close();
