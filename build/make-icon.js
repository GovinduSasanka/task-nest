// Renders build/icon.png (512x512) from an inline SVG. Run: npx electron build/make-icon.js
const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#FBF8F1"/><stop offset="1" stop-color="#F1EADB"/>
    </linearGradient>
    <linearGradient id="l1" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#9FD3AB"/><stop offset="1" stop-color="#6FAE7E"/>
    </linearGradient>
    <linearGradient id="l2" x1="1" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#7DBE8D"/><stop offset="1" stop-color="#4E9462"/>
    </linearGradient>
  </defs>
  <rect x="24" y="24" width="464" height="464" rx="112" fill="url(#bg)"/>
  <rect x="24" y="24" width="464" height="464" rx="112" fill="none" stroke="#E6DDCB" stroke-width="6"/>
  <ellipse cx="256" cy="398" rx="110" ry="20" fill="#E4DAC6"/>
  <path d="M256 396V250" stroke="#5DA271" stroke-width="22" stroke-linecap="round"/>
  <path d="M256 290c-14-70-68-104-142-96 8 72 64 108 142 96Z" fill="url(#l1)"/>
  <path d="M256 252c8-74 64-116 138-114-2 74-58 116-138 114Z" fill="url(#l2)"/>
  <circle cx="378" cy="120" r="14" fill="#F2A7BB"/>
  <circle cx="410" cy="160" r="8" fill="#F6C86B"/>
</svg>`;

app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: 512, height: 512, show: false, transparent: true, frame: false, useContentSize: true, webPreferences: { offscreen: true } });
  await win.loadURL('data:text/html,' + encodeURIComponent(`<html><body style="margin:0;background:transparent">${svg}</body></html>`));
  await new Promise((r) => setTimeout(r, 300));
  const img = await win.webContents.capturePage({ x: 0, y: 0, width: 512, height: 512 });
  fs.writeFileSync(path.join(__dirname, 'icon.png'), img.resize({ width: 512, height: 512, quality: 'best' }).toPNG());
  console.log('icon written');
  app.quit();
});
