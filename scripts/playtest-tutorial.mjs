// Headless browser run of the tutorial with scripted human-ish input; screenshots per lesson, video, console errors.
// usage: node scripts/playtest-tutorial.mjs [url] [prefix]
import { chromium } from "playwright";
import fs from "node:fs";

const url = process.argv[2] ?? "http://localhost:3006/kessler/";
const prefix = process.argv[3] ?? "tutorial";
const outDir = ".playtest";
fs.mkdirSync(outDir, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROME ?? "/usr/bin/google-chrome", args: ["--autoplay-policy=no-user-gesture-required", "--enable-gpu-rasterization"] });
const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, recordVideo: { dir: outDir, size: { width: 1280, height: 800 } } });
const page = await context.newPage();
const errors = [];
page.on("console", (m) => { if (m.type() === "error" || m.type() === "warning") errors.push(`[${m.type()}] ${m.text()}`); });
page.on("pageerror", (e) => errors.push(`[pageerror] ${e.message}`));
await page.goto(url, { waitUntil: "networkidle" });
await page.waitForTimeout(1000);
await page.screenshot({ path: `${outDir}/${prefix}-00-menu.png` });
await page.click("#btn-tutorial");
await page.waitForTimeout(600);

const stepNow = () => page.evaluate(() => document.getElementById("tut")?.dataset.step ?? "");
const shot = (name) => page.screenshot({ path: `${outDir}/${prefix}-${name}.png` });
const t0 = Date.now();
const log = (m) => console.log(`[${((Date.now() - t0) / 1000).toFixed(1)}s] ${m}`);
async function until(step, ms, act) {
  const start = Date.now();
  while (Date.now() - start < ms) {
    if ((await stepNow()) === step) return true;
    await act();
  }
  return (await stepNow()) === step;
}
const hold = async (key, ms) => { await page.keyboard.down(key); await page.waitForTimeout(ms); await page.keyboard.up(key); };

await shot("01-walk");
// 1. walk: the player starts on the underside; push A then W to go around the left side and over the top
const walkKeys = ["KeyA", "KeyW", "KeyD"];
let wi = 0;
log(`walk ok: ${await until("launch", 20000, async () => { await hold(walkKeys[wi % 3], 700); wi++; })}`);
await page.waitForTimeout(500);
await shot("02-launch");
// 2. launch standing still
log(`launch ok: ${await until("fly", 8000, async () => { await page.keyboard.press("ShiftLeft"); await page.waitForTimeout(400); })}`);
await page.waitForTimeout(900);
await shot("03-fly-slowmo");
// 3. steer: two directions
await hold("KeyW", 250);
await page.waitForTimeout(400);
await shot("03b-fly-onekey");
await hold("KeyD", 250);
await page.waitForTimeout(600);
// a short burst of W, then coast; relaunch if we ended up back on the big planet
log(`fly ok: ${await until("sweep", 40000, async () => {
  const st = await stepNow();
  if (st === "launch") { await page.waitForTimeout(500); await page.keyboard.press("ShiftLeft"); await page.waitForTimeout(1500); await hold("KeyW", 200); await hold("KeyA", 200); }
  else if (st === "fly") { await hold("KeyW", 300); await page.waitForTimeout(900); }
  else await page.waitForTimeout(200);
})}`);
await page.waitForTimeout(2500);
await shot("04-sweep-hover");
// 4. stand still and swing
log(`sweep ok: ${await until("debris", 30000, async () => { await page.keyboard.press("Space"); await page.waitForTimeout(700); })}`);
await page.waitForTimeout(800);
await shot("05-debris");
log(`debris ok: ${await until("wave", 15000, async () => { await page.waitForTimeout(200); })}`);
await page.waitForTimeout(2500);
await shot("06-wave");
// 6. move toward it and swing while moving
let wi2 = 0;
log(`wave ok: ${await until("brawl", 60000, async () => {
  const key = wi2 % 8 < 4 ? "KeyA" : "KeyD";
  await page.keyboard.down(key); await page.waitForTimeout(120); await page.keyboard.press("Space"); await page.waitForTimeout(200); await page.keyboard.up(key);
  wi2++;
})}`);
await page.waitForTimeout(2500);
await shot("07-brawl");
// 7. wiggle and swing
let fi = 0;
log(`brawl ok: ${await until("gun", 90000, async () => {
  await page.keyboard.press("Space");
  await hold(fi % 2 ? "KeyA" : "KeyD", 220);
  await page.keyboard.press("Space");
  await page.waitForTimeout(150);
  if (++fi % 40 === 0) await shot(`07-brawl-${fi}`);
})}`);
await page.waitForTimeout(3000);
await shot("08-gun");
// 8. gun: launch, then fire while airborne
let gi = 0;
log(`gun ok: ${await until("done", 90000, async () => {
  await page.keyboard.press("ShiftLeft");
  for (let i = 0; i < 4; i++) { await page.waitForTimeout(350); await page.keyboard.press("Space"); }
  await page.waitForTimeout(1800);
  if (++gi % 6 === 0) await shot(`08-gun-${gi}`);
})}`);
await page.waitForTimeout(2200);
await shot("06-done");
const hud = await page.evaluate(() => ({ step: document.getElementById("tut")?.dataset.step, hp: document.getElementById("hp-text")?.textContent, doneShown: !document.getElementById("tutdone")?.classList.contains("hidden"), profile: localStorage.getItem("kessler.profile.v1") }));
console.log("END:", hud);
console.log(errors.length ? `ERRORS (${errors.length}):\n` + errors.slice(0, 20).join("\n") : "no console errors");
const video = page.video();
await context.close();
if (video) { const p = await video.path(); fs.renameSync(p, `${outDir}/${prefix}.webm`); console.log("video:", `${outDir}/${prefix}.webm`); }
await browser.close();
