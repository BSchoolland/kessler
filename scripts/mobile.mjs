// Portrait-phone emulation: does the stage rotate, do touch controls work, any errors? node scripts/mobile.mjs [url]
import { chromium, devices } from "playwright";
const url = process.argv[2] ?? "http://localhost:3016/kessler/";
const browser = await chromium.launch({ executablePath: process.env.CHROME ?? "/usr/bin/google-chrome" });
const ctx = await browser.newContext({ ...devices["iPhone 13"], viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
const page = await ctx.newPage();
const errors = []; page.on("pageerror", (e) => errors.push(e.message)); page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
await page.goto(url, { waitUntil: "networkidle" });
await page.waitForTimeout(500);
await page.touchscreen.tap(8, 8); // first touch (off any button): flips usingTouch and rotates the stage
await page.waitForTimeout(300);
const rot0 = await page.evaluate(() => ({ rot: document.getElementById("stage").classList.contains("rot"), w: document.getElementById("stage").style.width, h: document.getElementById("stage").style.height, canvas: [document.getElementById("game").width, document.getElementById("game").height] }));
console.log("after first touch:", JSON.stringify(rot0));
await page.screenshot({ path: ".playtest/mobile-menu.png" });
// tap PLAY: the button is inside the rotated stage, so use its bounding box on screen
const play = await page.locator("#btn-play").boundingBox();
await page.touchscreen.tap(play.x + play.width / 2, play.y + play.height / 2);
await page.waitForTimeout(1500);
const hud = await page.evaluate(() => ({ touchShown: !document.getElementById("touch").classList.contains("hidden"), wave: document.getElementById("wave-label")?.textContent, hp: document.getElementById("hp-text")?.textContent }));
console.log("in game:", JSON.stringify(hud));
// hold a move on the left zone (screen coords: the stage's left half is the screen's top half when rotated)
const zl = await page.locator("#zone-l").boundingBox();
const zr = await page.locator("#zone-r").boundingBox();
console.log("zones on screen:", JSON.stringify({ zl, zr }));
const cdp = await ctx.newCDPSession(page);
await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: zl.x + zl.width / 2, y: zl.y + zl.height / 2, id: 1 }] });
await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: zl.x + zl.width / 2, y: zl.y + zl.height / 2 - 40, id: 1 }] });
await page.waitForTimeout(900);
await page.screenshot({ path: ".playtest/mobile-move.png" });
await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
for (let i = 0; i < 3; i++) { await page.touchscreen.tap(zr.x + zr.width / 2, zr.y + zr.height / 2); await page.waitForTimeout(400); }
const dash = await page.locator("#t-dash").boundingBox();
await page.touchscreen.tap(dash.x + dash.width / 2, dash.y + dash.height / 2);
await page.waitForTimeout(700);
await page.screenshot({ path: ".playtest/mobile-play.png" });
const after = await page.evaluate(() => ({ hp: document.getElementById("hp-text")?.textContent, dash: document.getElementById("dash-text")?.textContent }));
console.log("after inputs:", JSON.stringify(after));
console.log(errors.length ? "ERRORS: " + errors.slice(0, 5).join(" | ") : "no console errors");
await browser.close();
