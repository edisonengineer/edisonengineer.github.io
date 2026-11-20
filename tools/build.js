#!/usr/bin/env node
/* =========================================================================
   Builds the job-application portfolio into site/ from the main site's data:
     content/cv.js            experience, education, skills, languages
     js/projects.js           projects you maintain by hand
     js/sheet-works.js        projects from the Google Sheet "Works" tab
     js/certificates.js       certificates (replaced by the sheet's list
     js/sheet-data.js           in sheet-data.js when the sheet has one)

   Nothing here is edited by hand: change the sheet (or the main repo) and
   this site follows on its next build. Filters live in portfolio.config.json.

   Run:  bash tools/pull-content.sh && node tools/build.js
   Or point at a local copy of the main repo:  SOURCE=../MY-PAST-PROJECTS node tools/build.js
   ========================================================================= */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
const SRC = path.resolve(ROOT, process.env.SOURCE || '_source');
const OUT = path.join(ROOT, 'site');
const CFG = JSON.parse(fs.readFileSync(path.join(ROOT, 'portfolio.config.json'), 'utf8'));
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(path.join(OUT, 'projects'), { recursive: true });

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const has = (rel) => !!rel && fs.existsSync(path.join(SRC, rel));
const copied = new Set();
function use(rel) {                       // copy a file from the main repo into the site, once
    if (!has(rel)) return '';
    if (!copied.has(rel)) {
        fs.mkdirSync(path.dirname(path.join(OUT, rel)), { recursive: true });
        fs.copyFileSync(path.join(SRC, rel), path.join(OUT, rel));
        copied.add(rel);
    }
    return rel;
}
const small = (rel) => { const s = String(rel || '').replace(/(\.\w+)$/, '-800$1'); return has(s) ? s : rel; };
const LANGS = [['en', 'EN', 'English'], ['fr', 'FR', 'Français'], ['sw', 'SW', 'Kiswahili']];
const parts = (...xs) => xs.filter(Boolean).map((x) => `<span>${esc(x)}</span>`).join(' · ');
const link = (href) => /^(https?:|mailto:|tel:)/.test(href) ? href : CFG.mainSiteUrl + href;   // main-site pages stay on the main site

/* ---------- Data from the main repo ---------- */
if (!fs.existsSync(path.join(SRC, 'js/projects.js'))) {
    console.error('No main-site content in ' + SRC + '. Run: bash tools/pull-content.sh');
    process.exit(1);
}
const ctx = { window: {} };
['js/config.js', 'content/cv.js', 'js/projects.js', 'js/sheet-works.js', 'js/certificates.js', 'js/sheet-data.js']
    .filter(has).forEach((f) => vm.runInNewContext(fs.readFileSync(path.join(SRC, f), 'utf8'), ctx));
const W = ctx.window;
const CV = W.CV;

const order = (p) => { const i = (CFG.projectOrder || []).indexOf(p.id); return i < 0 ? 999 : i; };
const projects = (W.PROJECTS || [])
    .filter((p) => p.portfolio !== false)                                  // sheet "Job portfolio" = No, or portfolio: false
    .filter((p) => (CFG.categories || ['engineering', 'graphic']).includes(p.category))
    .filter((p) => !(CFG.excludeProjects || []).includes(p.id))
    .map((p, i) => Object.assign({ _i: i }, p))
    .sort((a, b) => order(a) - order(b) || a._i - b._i);
const engineering = projects.filter((p) => p.category === 'engineering');
const graphic = projects.filter((p) => p.category === 'graphic');
const certificates = (W.CERTIFICATES || [])
    .filter((c) => c.portfolio !== false && !(CFG.excludeCertificates || []).includes(c.title));

/* ---------- Page parts ---------- */
const name = CV.name;
const headline = CFG.headline || CV.title;
const photo = use('images/profile/edison-portrait.jpg') || use('images/profile/edison.jpg');
const cvPdf = use('pdfs/edison-ochieng-cv.pdf');
const C = CFG.contact || {};
const contacts = [
    C.email && ['Email', 'mailto:' + C.email, C.email],
    C.phone && CV.phone && ['Phone', 'tel:' + CV.phone.replace(/\s+/g, ''), CV.phone],
    C.linkedin && CV.linkedin && ['LinkedIn', CV.linkedin, 'linkedin.com/in/' + CV.linkedin.replace(/\/$/, '').split('/').pop()],
    C.whatsapp && W.SITE_CONFIG && W.SITE_CONFIG.whatsapp && ['WhatsApp', 'https://wa.me/' + W.SITE_CONFIG.whatsapp, '+' + W.SITE_CONFIG.whatsapp]
].filter(Boolean);
/* ---------- Languages: the main site's dictionaries (hand-written + automatic sheet translations) + this site's own labels ---------- */
const i18nReady = has('js/i18n.js') && has('js/i18n-fr.js') && has('js/i18n-sw.js');
if (i18nReady) {
    use('js/i18n.js');
    const OWN = JSON.parse(fs.readFileSync(path.join(ROOT, 'i18n-portfolio.json'), 'utf8'));
    for (const l of ['fr', 'sw']) {
        const U = l.toUpperCase();
        const read = (f) => (has(f) ? fs.readFileSync(path.join(SRC, f), 'utf8') : '');
        fs.mkdirSync(path.join(OUT, 'js'), { recursive: true });
        // Order of precedence: this site's labels, then the hand-written dictionary, then the sheet's automatic translations
        fs.writeFileSync(path.join(OUT, 'js/lang-' + l + '.js'), read('js/i18n-sheet-' + l + '.js') + '\n' + read('js/i18n-' + l + '.js') + '\n' +
            'window.I18N_' + U + ' = Object.assign({}, window.I18N_' + U + '_SHEET || {}, window.I18N_' + U + ' || {}, ' + JSON.stringify(OWN[l] || {}) + ');\n');
    }
}
['fonts/plus-jakarta-sans-latin.woff2', 'fonts/fraunces-latin.woff2', 'favicon.svg', 'favicon.ico'].forEach(use);

function page({ title, description, body, depth = 0, extraHead = '', url = '', jsonld = null }) {
    const up = depth ? '../'.repeat(depth) : '';
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${esc(title)}</title>
    <meta name="description" content="${esc(description)}">
    ${url ? `<link rel="canonical" href="${esc(url)}">\n    <meta property="og:url" content="${esc(url)}">` : ''}
    <meta property="og:type" content="${depth ? 'article' : 'profile'}">
    <meta property="og:title" content="${esc(title)}">
    <meta property="og:description" content="${esc(description)}">
    ${photo ? `<meta property="og:image" content="${esc(CFG.siteUrl + photo)}">` : ''}
    <meta name="twitter:card" content="summary">
    <link rel="icon" href="${up}favicon.svg" type="image/svg+xml">
    ${jsonld ? `<script type="application/ld+json">${JSON.stringify(jsonld).replace(/</g, '\\u003c')}</script>` : ''}
    <link rel="stylesheet" href="${up}css/portfolio.css">
    ${extraHead}
    ${i18nReady ? `<script defer src="${up}js/i18n.js" data-fr="${up}js/lang-fr.js" data-sw="${up}js/lang-sw.js"></script>` : ''}
</head>
<body>
    <header class="top"><div class="wrap">
        <a class="brand" href="${up}index.html" data-no-i18n>${esc(name)}</a>
        <nav aria-label="Primary">
            <a href="${up}index.html#projects">Projects</a>
            <a href="${up}index.html#experience">Experience</a>
            <a href="${up}index.html#certificates">Certificates</a>
            ${cvPdf ? `<a class="btn small" href="${up}${cvPdf}" download>Download CV</a>` : ''}
            ${i18nReady ? `<span class="langs" role="group" aria-label="Language">${LANGS.map(([l, short, full]) => `<button type="button" data-lang="${l}" aria-pressed="${l === 'en'}" aria-label="${full}" data-no-i18n>${short}</button>`).join('')}</span>` : ''}
        </nav>
    </div></header>
    <main>${body}</main>
    <footer class="foot"><div class="wrap">
        <span>© ${new Date().getFullYear()} <span data-no-i18n>${esc(name)}</span></span>
        ${CFG.linkToMainSite ? `<a href="${esc(CFG.mainSiteUrl)}">Freelance studio site</a>` : ''}
    </div></footer>
</body>
</html>
`;
}

const card = (p) => {
    const img = use(small(p.cover)) || use(p.cover);
    return `<a class="card" href="projects/${esc(p.id)}.html">
                <div class="card-img theme-${esc(p.theme || 'blue')}">${img ? `<img src="${esc(img)}" alt="" loading="lazy" decoding="async">` : ''}</div>
                <div class="card-body">
                    <span class="eyebrow">${parts(p.year, p.subtitle)}</span>
                    <h3>${esc(p.title)}</h3>
                    <p>${esc(p.summary)}</p>
                    <ul class="tags">${(p.tags || []).slice(0, 4).map((t) => `<li>${esc(t)}</li>`).join('')}</ul>
                </div>
            </a>`;
};

/* ---------- Home ---------- */
const intro = CFG.intro || CV.summary;
const ONE_PAGE_PDF = 'edison-ochieng-one-page-portfolio.pdf';   // made from one-page.html by tools/build-pdf.js
const personLd = {
    '@context': 'https://schema.org', '@type': 'Person', name, jobTitle: headline, url: CFG.siteUrl, description: intro,
    ...(photo ? { image: CFG.siteUrl + photo } : {}),
    ...(C.email ? { email: 'mailto:' + C.email } : {}),
    address: { '@type': 'PostalAddress', addressLocality: String(CV.location || '').split(',')[0].trim(), addressCountry: 'KE' },
    alumniOf: (CV.education || []).slice(0, 1).map((e) => ({ '@type': 'CollegeOrUniversity', name: e.org })),
    knowsAbout: (CV.skills || []).map((x) => String(x).split(':')[0].trim()),
    knowsLanguage: (CV.languages || []).map((x) => String(x).split('(')[0].trim()),
    sameAs: [CV.linkedin, CFG.mainSiteUrl].filter(Boolean),
    hasCredential: certificates.map((c) => ({ '@type': 'EducationalOccupationalCredential', name: c.title, ...(c.issuer ? { recognizedBy: { '@type': 'Organization', name: c.issuer } } : {}) }))
};
const home = page({
    url: CFG.siteUrl, jsonld: personLd,
    title: name + ' | ' + headline,
    description: intro.slice(0, 160),
    body: `
    <section class="hero"><div class="wrap hero-grid">
        <div>
            <p class="eyebrow">${esc(CV.location)}</p>
            <h1>${esc(name)}</h1>
            <p class="lead">${esc(headline)}</p>
            <p>${esc(intro)}</p>
            <div class="actions">
                ${cvPdf ? `<a class="btn" href="${cvPdf}" download>Download CV (PDF)</a>` : ''}
                <a class="btn ghost" href="${ONE_PAGE_PDF}" download>One-page portfolio (PDF)</a>
                <a class="btn ghost" href="#contact">Contact me</a>
            </div>
        </div>
        ${photo ? `<img class="portrait" src="${photo}" alt="${esc(name)}" width="320" height="400">` : ''}
    </div></section>

    <section class="section" id="projects"><div class="wrap">
        <h2>Engineering projects</h2>
        <div class="grid">${engineering.map(card).join('')}</div>
        ${graphic.length ? `<h2 class="${CFG.showGraphicDesignAsSecondary ? 'h-secondary' : ''}">Graphic design</h2>
        <div class="grid ${CFG.showGraphicDesignAsSecondary ? 'grid-small' : ''}">${graphic.map(card).join('')}</div>` : ''}
    </div></section>

    <section class="section alt" id="experience"><div class="wrap two-col">
        <div>
            <h2>Experience</h2>
            ${CV.experience.map((e) => `<article class="item">
                <h3>${esc(e.role)}</h3>
                <p class="meta">${parts(e.org, e.dates)}</p>
                ${e.points.length ? `<ul>${e.points.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}
            </article>`).join('')}
        </div>
        <div>
            <h2>Education</h2>
            ${CV.education.map((e) => `<article class="item">
                <h3>${esc(e.title)}</h3>
                <p class="meta">${parts(e.org, e.dates)}</p>
                ${e.note ? `<p>${esc(e.note)}</p>` : ''}
            </article>`).join('')}
            <h2>Skills</h2>
            <ul class="skills">${CV.skills.map((s) => `<li>${esc(s)}</li>`).join('')}</ul>
            ${CV.languages ? `<h2>Languages</h2><p>${parts(...CV.languages)}</p>` : ''}
        </div>
    </div></section>

    ${certificates.length ? `<section class="section" id="certificates"><div class="wrap">
        <h2>Certificates &amp; honours</h2>
        <ul class="certs">${certificates.map((c) => {
            const f = use(c.file);
            return `<li><strong>${esc(c.title)}</strong><span>${esc(c.issuer)}</span>
                ${c.verify ? `<a href="${esc(c.verify)}" target="_blank" rel="noopener">Verify</a>` : f ? `<a href="${esc(f)}" target="_blank" rel="noopener">View</a>` : ''}</li>`;
        }).join('')}</ul>
    </div></section>` : ''}

    <section class="section alt" id="contact"><div class="wrap">
        <h2>Contact</h2>
        <ul class="contact">${contacts.map(([k, href, label]) => `<li><span>${k}</span><a href="${esc(href)}"${/^https/.test(href) ? ' target="_blank" rel="noopener"' : ''}>${esc(label)}</a></li>`).join('')}</ul>
    </div></section>`
});

/* ---------- Project pages ---------- */
function projectPage(p) {
    const gallery = (p.gallery && p.gallery.length ? p.gallery : [p.cover]).map((g) => use(g)).filter(Boolean);
    const model = use(p.model);
    const pdf = use(p.pdf);
    const s = p.story || {};
    return page({
        depth: 1,
        url: CFG.siteUrl + 'projects/' + p.id + '.html',
        jsonld: { '@context': 'https://schema.org', '@type': 'CreativeWork', name: p.title, description: p.summary, url: CFG.siteUrl + 'projects/' + p.id + '.html',
            ...(p.cover && has(p.cover) ? { image: CFG.siteUrl + (use(small(p.cover)) || use(p.cover)) } : {}), ...(p.year ? { dateCreated: String(p.year) } : {}),
            keywords: (p.tags || []).join(', '), creator: { '@type': 'Person', name, url: CFG.siteUrl } },
        title: p.title + ' | ' + name,
        description: p.summary,
        extraHead: model ? `<script type="module" src="${esc((W.SITE_CONFIG && W.SITE_CONFIG.modelViewerSrc) || 'https://cdn.jsdelivr.net/npm/@google/model-viewer@3.5.0/dist/model-viewer.min.js')}"></script>` : '',
        body: `
    <article class="section"><div class="wrap narrow">
        <a class="back" href="../index.html#projects">← All projects</a>
        <p class="eyebrow">${parts(p.year, p.subtitle)}</p>
        <h1>${esc(p.title)}</h1>
        <p class="lead">${esc(p.summary)}</p>
        ${(p.meta || []).length ? `<dl class="facts">${p.meta.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl>` : ''}
        ${model ? `<model-viewer class="model" src="../${esc(model)}" alt="3D model of ${esc(p.title)}" camera-controls auto-rotate ar shadow-intensity="1"></model-viewer>` : ''}
        ${s.brief ? `<h2>The brief</h2><p>${esc(s.brief)}</p>` : ''}
        ${s.approach ? `<h2>My approach</h2><p>${esc(s.approach)}</p>` : ''}
        ${(p.points || []).length ? `<h2>Highlights</h2><ul>${p.points.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}
        ${s.result ? `<h2>Result</h2><p>${esc(s.result)}</p>` : ''}
        <div class="actions">
            ${pdf ? `<a class="btn" href="../${esc(pdf)}" target="_blank" rel="noopener">Read the report (PDF)</a>` : ''}
            ${s.link && s.link.href ? `<a class="btn ghost" href="${esc(link(s.link.href))}" target="_blank" rel="noopener">${esc(s.link.label || 'Read more')}</a>` : ''}
        </div>
        ${(p.tags || []).length ? `<ul class="tags">${p.tags.map((t) => `<li>${esc(t)}</li>`).join('')}</ul>` : ''}
        <div class="gallery">${gallery.map((g) => `<a href="../${esc(g)}" target="_blank" rel="noopener"><img src="../${esc(use(small(g)) || g)}" alt="${esc(p.title)}" loading="lazy" decoding="async"></a>`).join('')}</div>
    </div></article>`
    });
}

/* ---------- Write ---------- */
fs.writeFileSync(path.join(OUT, 'index.html'), home);

/* ---------- One-page portfolio (A4) for job applications: tools/build-pdf.js turns it into a PDF ---------- */
function onePage() {
    const ids = CFG.pdfProjects && CFG.pdfProjects.length ? CFG.pdfProjects : [];
    const picked = (ids.length ? ids.map((id) => projects.find((p) => p.id === id)).filter(Boolean) : engineering).slice(0, 4);
    const cut = (t, n) => { t = String(t || ''); return t.length > n ? t.slice(0, n - 1).replace(/\s+\S*$/, '') + '…' : t; };
    const site = CFG.siteUrl.replace(/^https?:\/\//, '').replace(/\/$/, '');
    const certs = certificates.slice(0, 6);
    return `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><title>${esc(name)}: one-page portfolio</title><meta name="robots" content="noindex">
<style>
@font-face { font-family: 'Jakarta'; src: url('fonts/plus-jakarta-sans-latin.woff2') format('woff2'); font-weight: 200 800; }
@font-face { font-family: 'Fraunces'; src: url('fonts/fraunces-latin.woff2') format('woff2'); font-weight: 300 900; }
@page { size: A4; margin: 0; }
:root { --s: 1; --ink: #14181f; --muted: #5a6372; --line: #e3e6ec; --accent: #1f5fd1; }
* { box-sizing: border-box; }
html, body { margin: 0; }
body { position: relative; width: 210mm; height: 297mm; padding: 12mm 13mm 16mm; font: calc(8.6pt * var(--s))/1.42 'Jakarta', Arial, sans-serif; color: var(--ink); overflow: hidden; }
h1 { font: 600 calc(23pt * var(--s))/1.05 'Fraunces', Georgia, serif; margin: 0; }
h2 { font-size: calc(7.4pt * var(--s)); letter-spacing: .12em; text-transform: uppercase; color: var(--accent); margin: calc(9pt * var(--s)) 0 calc(4pt * var(--s)); }
a { color: inherit; text-decoration: none; }
.top { display: flex; gap: 5mm; align-items: center; border-bottom: 1.5px solid var(--ink); padding-bottom: 3.5mm; }
.top img { width: 22mm; height: 22mm; border-radius: 50%; object-fit: cover; }
.lead { font-size: calc(11pt * var(--s)); color: var(--muted); margin: 1mm 0 1.5mm; }
.contact { display: flex; flex-wrap: wrap; gap: 1mm 4mm; font-size: calc(8pt * var(--s)); }
.summary { margin: 3mm 0 0; color: #2b313c; }
.projects { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 3mm; }
.proj { display: flex; min-width: 0; gap: 3mm; border: 1px solid var(--line); border-radius: 2.5mm; padding: 2.2mm; }
.proj img, .proj .ph { flex: none; width: 30mm; height: 21mm; border-radius: 1.5mm; object-fit: cover; background: #e8ecf3; }
.proj strong { display: block; font-size: calc(9pt * var(--s)); line-height: 1.25; }
.proj .meta { color: var(--muted); font-size: calc(7.3pt * var(--s)); }
.proj p { margin: .8mm 0 0; font-size: calc(7.6pt * var(--s)); }
.proj > span { min-width: 0; }
.proj .url { color: var(--accent); font-size: calc(7pt * var(--s)); overflow-wrap: anywhere; }
.cols { display: grid; grid-template-columns: minmax(0, 1.35fr) minmax(0, 1fr); gap: 7mm; }
.item { margin-bottom: 2.2mm; }
.item b { display: block; }
.item .meta { color: var(--muted); font-size: calc(7.6pt * var(--s)); }
.item ul { margin: .6mm 0 0; padding-left: 4mm; }
.skills { margin: 0; padding-left: 4mm; }
.certs { margin: 0; padding-left: 4mm; }
.foot { position: absolute; left: 13mm; right: 13mm; bottom: 8mm; display: flex; justify-content: space-between; color: var(--muted); font-size: calc(7pt * var(--s)); }
</style></head>
<body>
<header class="top">
    ${photo ? `<img src="${esc(photo)}" alt="">` : ''}
    <div>
        <h1>${esc(name)}</h1>
        <p class="lead">${esc(headline)} · ${esc(CV.location)}</p>
        <div class="contact">${contacts.map(([k, href, label]) => `<a href="${esc(href)}">${esc(label)}</a>`).join('')}<a href="${esc(CFG.siteUrl)}">${esc(site)}</a></div>
    </div>
</header>
<p class="summary">${esc(cut(intro, 620))}</p>

<h2>Selected projects</h2>
<div class="projects">
${picked.map((p) => { const img = use(small(p.cover)) || use(p.cover); return `    <a class="proj" href="${esc(CFG.siteUrl + 'projects/' + p.id + '.html')}">
        ${img ? `<img src="${esc(img)}" alt="">` : '<span class="ph"></span>'}
        <span><strong>${esc(p.title)}</strong><span class="meta">${esc([p.year, p.subtitle].filter(Boolean).join(' · '))}</span>
        <p>${esc(cut(p.outcome || p.summary, 120))}</p><span class="url">${esc(site + '/projects/' + p.id)}</span></span>
    </a>`; }).join('\n')}
</div>

<div class="cols">
    <section>
        <h2>Experience</h2>
${CV.experience.slice(0, 4).map((e) => `        <div class="item"><b>${esc(e.role)}</b><span class="meta">${esc(e.org)} · ${esc(e.dates)}</span>${e.points.length ? `<ul>${e.points.slice(0, 2).map((x) => `<li>${esc(cut(x, 150))}</li>`).join('')}</ul>` : ''}</div>`).join('\n')}
    </section>
    <section>
        <h2>Education</h2>
${CV.education.slice(0, 2).map((e) => `        <div class="item"><b>${esc(e.title)}</b><span class="meta">${esc(e.org)} · ${esc(e.dates)}</span></div>`).join('\n')}
        <h2>Skills</h2>
        <ul class="skills">${CV.skills.slice(0, 7).map((x) => `<li>${esc(x)}</li>`).join('')}</ul>
        ${certs.length ? `<h2>Certificates &amp; honours</h2>
        <ul class="certs">${certs.map((c) => `<li>${esc(c.title)}${c.issuer ? ` <span class="meta">(${esc(c.issuer)})</span>` : ''}</li>`).join('')}</ul>` : ''}
        ${CV.languages ? `<h2>Languages</h2><p style="margin:0">${CV.languages.map(esc).join(' · ')}</p>` : ''}
    </section>
</div>
<div class="foot"><span>Full portfolio, 3D models and CV: ${esc(site)}</span><span>Updated ${new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}</span></div>
</body></html>
`;
}
fs.writeFileSync(path.join(OUT, 'one-page.html'), onePage());
projects.forEach((p) => fs.writeFileSync(path.join(OUT, 'projects', p.id + '.html'), projectPage(p)));
fs.mkdirSync(path.join(OUT, 'css'), { recursive: true });
fs.copyFileSync(path.join(ROOT, 'css/portfolio.css'), path.join(OUT, 'css/portfolio.css'));
fs.writeFileSync(path.join(OUT, '.nojekyll'), '');
// This is the domain's robots.txt, so it also covers the services site (mainSiteUrl) and lists its sitemap
const mainPath = CFG.mainSiteUrl && CFG.mainSiteUrl.startsWith(CFG.siteUrl) ? '/' + CFG.mainSiteUrl.slice(CFG.siteUrl.length) : '';
fs.writeFileSync(path.join(OUT, 'robots.txt'), 'User-agent: *\nAllow: /\nDisallow: /one-page.html\n' + (mainPath ? 'Disallow: ' + mainPath + 'share/\n' : '') +
    '\nSitemap: ' + CFG.siteUrl + 'sitemap.xml\n' + (mainPath ? 'Sitemap: ' + CFG.mainSiteUrl + 'sitemap.xml\n' : ''));
const today = new Date().toISOString().slice(0, 10);
fs.writeFileSync(path.join(OUT, 'sitemap.xml'), '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    [''].concat(projects.map((p) => 'projects/' + p.id + '.html')).map((u) => '    <url><loc>' + CFG.siteUrl + u + '</loc><lastmod>' + today + '</lastmod></url>').join('\n') + '\n</urlset>\n');

const left = (W.PROJECTS || []).length - projects.length;
console.log(`Built site/: ${engineering.length} engineering + ${graphic.length} graphic project(s)` +
    (left ? `, ${left} hidden by filters` : '') + `, ${certificates.length} certificate(s), ${copied.size} file(s) copied.`);
