// Watch the wave-20 boss fall with the debug params and confirm the win screen: node scripts/winflow.mjs [url]
import { chromium } from "playwright";
const url = process.argv[2] ?? "http://localhost:3016/kessler/";
const browser = await chromium.launch({ executablePath: process.env.CHROME ?? "/usr/bin/google-chrome" });
const page = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
await page.goto(`${url}?bot=1&wave=20&seed=61&god=1&smite=1`, { waitUntil: "networkidle" });
await page.waitForTimeout(500);
await page.click("#btn-play");
const t0 = Date.now();
let shown = false;
while (Date.now() - t0 < 120000) {
  await page.waitForTimeout(1000);
  if (await page.locator("#offers:not(.hidden)").count()) await page.keyboard.press("Digit1");
  if (await page.locator("#won:not(.hidden)").count()) { shown = true; break; }
  if ((Date.now() - t0) % 15000 < 1000) await page.screenshot({ path: `.playtest/win-${Math.round((Date.now() - t0) / 1000)}s.png` });
}
await page.screenshot({ path: ".playtest/win-screen.png" });
console.log("won screen shown:", shown, "after", ((Date.now() - t0) / 1000).toFixed(0), "s", errors.length ? "ERRORS " + errors.join(" | ") : "no errors");
if (shown) {
  await page.click("#btn-won-go");
  await page.waitForTimeout(3000);
  const hud = await page.evaluate(() => ({ wave: document.getElementById("wave-label")?.textContent, won: !document.getElementById("won")?.classList.contains("hidden") }));
  console.log("after KEEP GOING:", JSON.stringify(hud));
}
await browser.close();
