// Headless browser playtest: loads the built game, plays (bot via ?bot=1 or scripted input), screenshots, video, console errors.
// usage: node scripts/playtest.mjs [url] [seconds] [prefix]
import { chromium } from "playwright";
import fs from "node:fs";

const url = process.argv[2] ?? "http://localhost:3006/kessler/";
const seconds = Number(process.argv[3] ?? 45);
const prefix = process.argv[4] ?? "run";
const outDir = ".playtest";
const botMode = url.includes("bot=1");
fs.mkdirSync(outDir, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROME ?? "/usr/bin/google-chrome", args: ["--autoplay-policy=no-user-gesture-required", "--enable-gpu-rasterization"] });
const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, recordVideo: { dir: outDir, size: { width: 1280, height: 800 } } });
const page = await context.newPage();
const errors = [];
page.on("console", (m) => { if (m.type() === "error" || m.type() === "warning") errors.push(`[${m.type()}] ${m.text()}`); });
page.on("pageerror", (e) => errors.push(`[pageerror] ${e.message}`));
await page.goto(url, { waitUntil: "networkidle" });
await page.waitForTimeout(1200);
await page.screenshot({ path: `${outDir}/${prefix}-00-menu.png` });
await page.click("#btn-play");
await page.waitForTimeout(400);
const box = await page.locator("canvas#game").boundingBox();
const cx = box.x + box.width / 2, cy = box.y + box.height / 2;
let shot = 1;
let nextShot = 5000;
const t0 = Date.now();
while (Date.now() - t0 < seconds * 1000) {
  const el = Date.now() - t0;
  if (!botMode) {
    const a = (el / 1000) * 1.3;
    await page.mouse.move(cx + Math.cos(a) * 240, cy + Math.sin(a) * 240);
    const r = Math.random();
    if (r < 0.35) await page.mouse.click(cx + Math.cos(a) * 240, cy + Math.sin(a) * 240);
    if (r > 0.9) await page.keyboard.press("Space");
    await page.keyboard.down(Math.random() < 0.5 ? "KeyA" : "KeyD");
    await page.waitForTimeout(250);
    await page.keyboard.up("KeyA");
    await page.keyboard.up("KeyD");
  } else {
    await page.waitForTimeout(200);
  }
  if (el > nextShot) {
    await page.screenshot({ path: `${outDir}/${prefix}-${String(shot++).padStart(2, "0")}-play.png` });
    nextShot += 5000;
  }
  if (await page.locator("#offers:not(.hidden)").count()) {
    await page.screenshot({ path: `${outDir}/${prefix}-${String(shot++).padStart(2, "0")}-offers.png` });
    await page.keyboard.press(`Digit${1 + Math.floor(Math.random() * 3)}`);
  }
  if (await page.locator("#gameover:not(.hidden)").count()) {
    await page.waitForTimeout(800);
    await page.screenshot({ path: `${outDir}/${prefix}-${String(shot++).padStart(2, "0")}-gameover.png` });
    break;
  }
}
const hud = await page.evaluate(() => ({ wave: document.getElementById("wave-label")?.textContent, score: document.getElementById("score")?.textContent, hp: document.getElementById("hp-text")?.textContent, over: !document.getElementById("gameover")?.classList.contains("hidden") }));
console.log("HUD:", hud);
console.log(errors.length ? `ERRORS (${errors.length}):\n` + errors.slice(0, 20).join("\n") : "no console errors");
const video = page.video();
await context.close();
if (video) { const p = await video.path(); fs.renameSync(p, `${outDir}/${prefix}.webm`); console.log("video:", `${outDir}/${prefix}.webm`); }
await browser.close();
