// Landscape-phone screenshots of the HUD in play, the tutorial and a boss: node scripts/phoneshots.mjs [url]
import { chromium, devices } from "playwright";
const url = process.argv[2] ?? "http://localhost:3016/kessler/";
const browser = await chromium.launch({ executablePath: process.env.CHROME ?? "/usr/bin/google-chrome" });
const ctx = await browser.newContext({ ...devices["iPhone 13"], viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true });
const page = await ctx.newPage();
const errors = []; page.on("pageerror", (e) => errors.push(e.message));
async function run(query, name, wait, extra) {
  await page.goto(`${url}${query}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(400);
  await page.touchscreen.tap(8, 380);
  await page.waitForTimeout(200);
  const btn = await page.locator(query.includes("tut") ? "#btn-tutorial" : "#btn-play").boundingBox();
  await page.touchscreen.tap(btn.x + btn.width / 2, btn.y + btn.height / 2);
  await page.waitForTimeout(wait);
  if (extra) await extra();
  await page.screenshot({ path: `.playtest/${name}.png` });
}
await run("?bot=1&god=1&seed=3", "phone-play", 6000);
await run("?bot=1&god=1&wave=10&seed=4", "phone-boss", 9000);
await run("?tut=1", "phone-tutorial", 1500, async () => { const b = await page.locator("#zone-l").boundingBox(); const cdp = await ctx.newCDPSession(page); await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: b.x + 120, y: b.y + b.height - 90, id: 1 }] }); await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: b.x + 160, y: b.y + b.height - 90, id: 1 }] }); await page.waitForTimeout(500); });
console.log(errors.length ? "ERRORS: " + errors.join(" | ") : "no console errors");
await browser.close();
