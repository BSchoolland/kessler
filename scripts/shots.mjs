// Screenshot a few waves with the bot driving: node scripts/shots.mjs [url] wave,wave,...
import { chromium } from "playwright";
import fs from "node:fs";
const url = process.argv[2] ?? "http://localhost:3016/kessler/";
const waves = (process.argv[3] ?? "6,7,9,12,10,15,20").split(",").map(Number);
fs.mkdirSync(".playtest", { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROME ?? "/usr/bin/google-chrome" });
const page = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
for (const w of waves) {
  await page.goto(`${url}?bot=1&wave=${w}&seed=${40 + w}${process.env.EXTRA ?? ""}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(600);
  await page.click("#btn-play");
  for (const t of [7, 14, 22]) {
    await page.waitForTimeout(t === 7 ? 7000 : t === 14 ? 7000 : 8000);
    if (await page.locator("#offers:not(.hidden)").count()) await page.keyboard.press("Digit1");
    await page.screenshot({ path: `.playtest/w${w}-${t}s.png` });
  }
  const hud = await page.evaluate(() => ({ wave: document.getElementById("wave-label")?.textContent, hp: document.getElementById("hp-text")?.textContent, boss: document.querySelector(".boss-name")?.textContent, over: !document.getElementById("gameover")?.classList.contains("hidden") }));
  console.log(`wave ${w}:`, JSON.stringify(hud));
}
console.log(errors.length ? `ERRORS:\n${errors.slice(0, 10).join("\n")}` : "no console errors");
await browser.close();
