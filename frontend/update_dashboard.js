const fs = require('fs');

let content = fs.readFileSync('/Users/lucky/availability-intelligence-engine/frontend/dashboard.js', 'utf8');

// A) Procurement / Receiving / Supplier karty
content = content.replace(/<h3 style="font-size: 16px;">/g, '<h3 class="card-title">');
content = content.replace(/<h3 style="font-size: 16px; margin-top: 2px;">/g, '<h3 class="card-title">');
content = content.replace(/<h3 style="font-size: 17px; margin-top: 2px;">/g, '<h3 class="card-title">');
content = content.replace(/<div style="margin: 10px 0; font-size: 13px;">/g, '<div class="mb-3">');
content = content.replace(/<div style="margin: 8px 0; font-size: 13px;">/g, '<div class="mb-2">');
content = content.replace(/<div style="display: flex; gap: 8px; margin-top: 10px;">/g, '<div class="card-actions">');
content = content.replace(/<div style="display: flex; gap: 8px; margin-top: 10px; flex-wrap: wrap;">/g, '<div class="card-actions">');

// B) Meta grids
content = content.replace(/<div style="display: grid; grid-template-columns: repeat\(3, 1fr\); gap: 10px; margin: 12px 0; font-size: 12px;">/g, '<div class="card-meta-grid">');
content = content.replace(/<div style="display: grid; grid-template-columns: repeat\(3, 1fr\); gap: 10px; margin-bottom: 12px; font-size: 12px;">/g, '<div class="card-meta-grid">');

// C) Exception a problem boxy
content = content.replace(/<div style="background: #fef2f2; border: 1px solid #fecaca; border-radius: var\(--radius-sm\); padding: 10px; margin-top: 8px;">/g, '<div class="alert-box alert-danger mt-2">');
content = content.replace(/<b style="color: var\(--brand-red\); font-size: 12px; text-transform: uppercase;">Co systém navrhuje:<\/b>/g, '<span class="alert-title">Co systém navrhuje:</span>');
content = content.replace(/<p style="font-size: 13px; color: #991b1b; margin-top: 2px;">/g, '<p class="alert-body">');

// D) Modal status banners
// "PŘIPRAVENO K EXPEDICI"
content = content.replace(
    /<div style="background: #f0fdf4; border: 1px solid #86efac; border-radius: 6px; padding: 16px; margin-bottom: 24px;">([\s\S]*?)<div style="font-size: 12px; font-weight: 800; text-transform: uppercase; color: #15803d; margin-bottom: 4px;">✅ PŘIPRAVENO K EXPEDICI<\/div>([\s\S]*?)<p style="font-size: 13px; color: #166534;">/g, 
    '<div class="alert-box alert-success mb-6">$1<span class="alert-title">✅ PŘIPRAVENO K EXPEDICI</span>$2<p class="alert-body">'
);
content = content.replace(
    /<div style="background: #f0fdf4; border: 1px solid #86efac; border-radius: var\(--radius-md\); padding: 16px; margin-bottom: 24px;">\s*<div style="font-size: 12px; font-weight: 800; text-transform: uppercase; color: #15803d; margin-bottom: 4px;">✅ PŘIPRAVENO K EXPEDICI<\/div>\s*<p style="font-size: 13px; color: #166534;">/g,
    '<div class="alert-box alert-success mb-6">\n<span class="alert-title">✅ PŘIPRAVENO K EXPEDICI</span>\n<p class="alert-body">'
);

// "EXPEDOVÁNO"
content = content.replace(
    /<div style="background: #eff6ff; border: 1px solid #bfdbfe; border-radius: var\(--radius-md\); padding: 16px; margin-bottom: 24px;">\s*<div style="font-size: 12px; font-weight: 800; text-transform: uppercase; color: #1d4ed8; margin-bottom: 2px;">EXPEDOVÁNO<\/div>\s*<p style="font-size: 13px; color: #1e3a8a;">/g,
    '<div class="alert-box alert-info mb-6">\n<span class="alert-title">EXPEDOVÁNO</span>\n<p class="alert-body">'
);
content = content.replace(
    /<div style="background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 6px; padding: 16px; margin-bottom: 24px;">\s*<div style="font-size: 12px; font-weight: 800; text-transform: uppercase; color: #1d4ed8; margin-bottom: 2px;">EXPEDOVÁNO<\/div>\s*<p style="font-size: 13px; color: #1e3a8a;">/g,
    '<div class="alert-box alert-info mb-6">\n<span class="alert-title">EXPEDOVÁNO</span>\n<p class="alert-body">'
);

// "ČEKÁ NA DOPLNĚNÍ SKLADU"
content = content.replace(
    /<div style="background: #fffbeb; border: 1px solid #fde68a; border-radius: var\(--radius-md\); padding: 16px; margin-bottom: 24px;">\s*<div style="font-size: 12px; font-weight: 800; text-transform: uppercase; color: #92400e; margin-bottom: 2px;">ČEKÁ NA DOPLNĚNÍ SKLADU<\/div>\s*<p style="font-size: 13px; color: #78350f;">/g,
    '<div class="alert-box alert-warning mb-6">\n<span class="alert-title">ČEKÁ NA DOPLNĚNÍ SKLADU</span>\n<p class="alert-body">'
);
content = content.replace(
    /<div style="background: #fffbeb; border: 1px solid #fde68a; border-radius: 6px; padding: 16px; margin-bottom: 24px;">\s*<div style="font-size: 12px; font-weight: 800; text-transform: uppercase; color: #92400e; margin-bottom: 2px;">ČEKÁ NA DOPLNĚNÍ SKLADU<\/div>\s*<p style="font-size: 13px; color: #78350f;">/g,
    '<div class="alert-box alert-warning mb-6">\n<span class="alert-title">ČEKÁ NA DOPLNĚNÍ SKLADU</span>\n<p class="alert-body">'
);


// E) Items summary grid v modal
content = content.replace(/<div style="display: grid; grid-template-columns: repeat\(4, 1fr\); gap: 12px; font-size: 12px;">/g, '<div class="grid-4">');
content = content.replace(/<div style="background: var\(--bg-subtle\); border: 1px solid var\(--border-color\); border-radius: var\(--radius-sm\); padding: 12px;">/g, '<div class="info-block">');
content = content.replace(/<span style="font-size: 10px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.05em; color: var\(--text-subtle\); display: block; margin-bottom: 4px;">/g, '<span class="info-block-label">');
content = content.replace(/<span style="font-size: 14px; font-weight: 700; color: var\(--text-main\); display: block;">/g, '<span class="info-block-value">');


// F) Subsection nadpisy v modal
content = content.replace(/<h4 style="font-size: 14px; font-weight: 800; margin-bottom: 8px;">/g, '<h4 class="subsection-title">');

// G) Problem box v modal
content = content.replace(/<p style="font-size: 13px; font-weight: 700; color: #9f1239; margin-bottom: 4px;">/g, '<p class="fw-bold text-danger-c mb-1">');
content = content.replace(/<p style="font-size: 12px; color: #881337; margin-bottom: 12px;">/g, '<p class="text-sm text-danger-c mb-3">');
content = content.replace(/<p style="font-size: 13px; color: #0f172a; line-height: 1.4;">/g, '<p class="text-base">');
content = content.replace(/<b style="font-size: 11px; text-transform: uppercase; color: #9f1239; display: block; margin-bottom: 6px;">CO MŮŽETE UDĚLAT:<\/b>/g, '<span class="alert-title">CO MŮŽETE UDĚLAT:</span>');
content = content.replace(/<div style="display: flex; gap: 8px; flex-wrap: wrap;">/g, '<div class="flex flex-wrap gap-2">');

// H) Audit timeline text - probably already replaced or missed, let's make sure
content = content.replace(/<div style="font-size: 12px; font-weight: 800; text-transform: uppercase; color: #15803d; margin-bottom: 4px;">✅ PŘIPRAVENO K EXPEDICI<\/div>/g, '<div class="alert-title text-success-c">✅ PŘIPRAVENO K EXPEDICI</div>');
content = content.replace(/<div style="font-size: 12px; font-weight: 800; text-transform: uppercase; color: #1d4ed8; margin-bottom: 2px;">EXPEDOVÁNO<\/div>/g, '<div class="alert-title text-info-c">EXPEDOVÁNO</div>');
content = content.replace(/<div style="font-size: 12px; font-weight: 800; text-transform: uppercase; color: #92400e; margin-bottom: 2px;">ČEKÁ NA DOPLNĚNÍ SKLADU<\/div>/g, '<div class="alert-title text-warning-c">ČEKÁ NA DOPLNĚNÍ SKLADU</div>');

// I) Shipping buttons
content = content.replace(/<button([^>]*?)style="background:#16a34a; border-color:#16a34a;"([^>]*?)>/g, '<button$1class="btn-success"$2>');
content = content.replace(/<button([^>]*?)style="background: #16a34a; border-color: #16a34a;"([^>]*?)>/g, '<button$1class="btn-success"$2>');

// Other possible generic classes
content = content.replace(/<button class="btn-action-red" style="background:#16a34a; border-color:#16a34a;">/g, '<button class="btn-success">');
content = content.replace(/<button class="btn-action-red" style="background: #16a34a; border-color: #16a34a;">/g, '<button class="btn-success">');

// J) Inline font-size: 13px na div bez jineho duvodu
content = content.replace(/<div style="font-size: 13px;">/g, '<div>');
// also some `<div style="... font-size: 13px;">` maybe needs more generic approach:
content = content.replace(/(<div style="[^"]*?)(?:; )?font-size:\s*13px;?(?: )?([^"]*?")/g, (match, p1, p2) => {
    let newStyle = (p1 + p2).replace('style=""', '');
    if (newStyle.endsWith('style=" "')) newStyle = newStyle.replace('style=" "', '');
    return newStyle;
});

fs.writeFileSync('/Users/lucky/availability-intelligence-engine/frontend/dashboard.js', content, 'utf8');

