// Renders public/icons/icon.svg to PNG app icons using the installed Chromium.
import { chromium } from "playwright-core";
import { readFileSync } from "node:fs";
const svg = readFileSync("public/icons/icon.svg", "utf8");
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const page = await browser.newPage();
for (const [name, size, pad] of [["icon-192.png", 192, 0], ["icon-512.png", 512, 0], ["maskable-512.png", 512, 0.12], ["apple-touch-icon.png", 180, 0]]) {
  await page.setViewportSize({ width: size, height: size });
  const inner = Math.round(size * (1 - pad * 2));
  await page.setContent(`<html><body style="margin:0;background:${pad ? "#0b8a51" : "transparent"};display:grid;place-items:center;width:${size}px;height:${size}px">${svg.replace("<svg ", `<svg width="${inner}" height="${inner}" `)}</body></html>`);
  await page.screenshot({ path: `public/icons/${name}`, omitBackground: !pad });
}
await browser.close();
console.log("icons generated");
