#!/usr/bin/env node
/* =========================================================================
   Turns site/one-page.html (made by tools/build.js) into the one-page A4 PDF
   site/edison-ochieng-one-page-portfolio.pdf, linked from the portfolio.
   If the content ever runs onto a second page, the text is scaled down a
   little and printed again, so it always stays on one page.
   Run after tools/build.js:  node tools/build-pdf.js   (needs Playwright)
   ========================================================================= */
'use strict';

const fs = require('fs');
const path = require('path');

let playwright;
try { playwright = require('playwright'); } catch (e) {
    playwright = require(path.join(require('child_process').execSync('npm root -g').toString().trim(), 'playwright'));
}

const SITE = path.resolve(__dirname, '..', 'site');
const SRC = path.join(SITE, 'one-page.html');
const OUT = path.join(SITE, 'edison-ochieng-one-page-portfolio.pdf');
const pages = (pdf) => (pdf.toString('latin1').match(/\/Type\s*\/Page[^s]/g) || []).length;

(async () => {
    if (!fs.existsSync(SRC)) { console.error('Run node tools/build.js first.'); process.exit(1); }
    const browser = await playwright.chromium.launch();
    try {
        const page = await browser.newPage();
        await page.goto('file://' + SRC, { waitUntil: 'networkidle' });
        await page.evaluate(() => document.fonts.ready);
        for (const scale of [1, 0.96, 0.92, 0.88, 0.84, 0.8]) {
            await page.evaluate((s) => document.documentElement.style.setProperty('--s', String(s)), scale);
            // Content taller than the A4 body would spill onto a second page
            // (the footer line sits in the bottom padding, so the content must end above it; nothing may stick out on the right)
            const overflow = await page.evaluate(() => {
                const b = document.body, cs = getComputedStyle(b);
                const bottom = b.getBoundingClientRect().bottom - parseFloat(cs.paddingBottom), right = b.getBoundingClientRect().right - parseFloat(cs.paddingRight);
                return [...b.querySelectorAll('header, p, section, .projects, .proj')].some((e) => { const r = e.getBoundingClientRect(); return r.bottom > bottom + 1 || r.right > right + 1; });
            });
            if (overflow && scale > 0.8) continue;
            const pdf = await page.pdf({ format: 'A4', printBackground: true, margin: { top: 0, right: 0, bottom: 0, left: 0 } });
            const n = pages(pdf);
            if (n > 1 && scale > 0.8) continue;
            fs.writeFileSync(OUT, pdf);
            console.log('Wrote ' + path.relative(path.resolve(__dirname, '..'), OUT) + ' (' + n + ' page, text scale ' + scale + ', ' + Math.round(pdf.length / 1024) + ' KB)');
            if (n > 1) console.warn('::warning::The one-page portfolio is longer than one page even at the smallest text size. Shorten the CV summary or set fewer pdfProjects.');
            return;
        }
    } finally {
        await browser.close();
    }
})().catch((err) => { console.error(err); process.exit(1); });
