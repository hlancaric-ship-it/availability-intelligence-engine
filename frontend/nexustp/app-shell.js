/**
 * L-Code Nexus — Dynamické vykreslení UI shellu z ui-config.js
 */
import {
    UI_BRAND,
    UI_TENANT,
    UI_NAV,
    UI_ACTIONS,
    UI_GUIDE,
    UI_VIEWS,
    UI_STATIC,
    UI_MODALS,
    UI_THEME,
} from './ui-config.js';

/** Injektuje CSS proměnné z UI_THEME — barvy měníš v ui-config.js */
export function applyTheme() {
    const t = UI_THEME;
    const root = document.documentElement;
    const map = {
        '--bg-app': t.bgApp,
        '--bg-surface': t.bgSurface,
        '--bg-subtle': t.bgSubtle,
        '--text-main': t.textMain,
        '--text-muted': t.textMuted,
        '--border-color': t.borderColor,
        '--brand-primary': t.brandPrimary,
        '--brand-primary-hover': t.brandPrimaryHover,
        '--brand-primary-light': t.brandPrimaryLight,
        '--brand-primary-border': t.brandPrimaryBorder,
        '--brand-gradient': t.brandGradient,
        '--accent-secondary': t.accentSecondary,
        '--accent-secondary-light': t.accentSecondaryLight,
        '--accent-secondary-border': t.accentSecondaryBorder,
        '--success-text': t.success,
        '--success-bg': t.successBg,
        '--success-border': t.successBorder,
        '--warning-text': t.warning,
        '--warning-bg': t.warningBg,
        '--warning-border': t.warningBorder,
        '--danger-text': t.danger,
        '--danger-bg': t.dangerBg,
        '--danger-border': t.dangerBorder,
        '--info-text': t.info,
        '--info-bg': t.infoBg,
        '--info-border': t.infoBorder,
    };
    Object.entries(map).forEach(([key, val]) => root.style.setProperty(key, val));
}

function esc(str) {
    if (str == null) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function renderContextBanner(cols, variant = 'default') {
    const bannerClass = variant === 'danger' ? 'context-banner banner-danger' : 'context-banner';
    const gridCols = cols.map(col => `
        <div class="context-col">
            <span class="context-label">${col.label}</span>
            <p class="context-text">${col.text}</p>
        </div>
    `).join('');
    return `<div class="${bannerClass}"><div class="context-grid">${gridCols}</div></div>`;
}

function renderSectionHeader(title, subtitle, actionsHtml = '') {
    return `
        <div class="section-card-header${actionsHtml.includes('toolbar-row') ? ' section-card-header--stacked' : ''}">
            <div class="section-card-header-row">
                <div>
                    <h2 class="section-card-title">${title}</h2>
                    <p class="section-card-subtitle">${subtitle}</p>
                </div>
                ${actionsHtml}
            </div>
        </div>
    `;
}

function renderDashboardView(cfg) {
    const kpis = cfg.kpis.map(k => `
        <div class="kpi-card kpi-card-${k.variant} clickable-kpi" data-target-view="${k.targetView}">
            <div class="kpi-top">
                <span class="kpi-label">${k.label}</span>
                <span class="kpi-pill ${k.pillClass}"${k.pillId ? ` id="${k.pillId}"` : ''}>${k.pill}</span>
            </div>
            <div class="kpi-value text-${k.variant}" id="${k.valueId}">0</div>
            <p class="kpi-desc">${k.desc}</p>
            <span class="kpi-link-hint ${k.hintClass}">${k.hint}</span>
        </div>
    `).join('');

    const columns = cfg.columns.map(c => `
        <article class="board-column">
            <div class="column-head">
                <div class="column-title-row">
                    <h2 class="column-title ${c.titleClass || ''}">${c.title}</h2>
                    <span class="column-count ${c.countClass || ''}" id="${c.countId}">0</span>
                </div>
                <p class="column-subtext">${c.subtext}</p>
            </div>
            <div id="${c.listId}" class="cards-stack"></div>
        </article>
    `).join('');

    return `
        ${renderContextBanner(cfg.context, cfg.contextVariant)}
        <div class="kpi-grid">${kpis}</div>
        <div class="columns-grid">${columns}</div>
    `;
}

function renderAvailabilityView(cfg) {
    const sections = cfg.sections.map(s => `
        <div class="section-card${s.spaced ? ' section-card--spaced' : ''}">
            ${renderSectionHeader(s.title, s.subtitle)}
            <div id="${s.contentId}" class="${s.contentClass || ''}"></div>
        </div>
    `).join('');
    return `${renderContextBanner(cfg.context, cfg.contextVariant)}${sections}`;
}

function renderOrdersView(cfg) {
    const s = cfg.section;
    const actions = s.actions.map(a => {
        const cls = a.variant === 'success' ? 'btn-success' : 'btn-secondary';
        return `<button class="${cls} btn-sm" id="${a.id}">${a.label}</button>`;
    }).join('');
    const filters = s.filters.map(f =>
        `<button class="btn-secondary btn-sm filter-btn${f.filter === 'ALL' ? ' active' : ''}" data-filter="${f.filter}">${f.label}</button>`
    ).join('');

    return `
        ${renderContextBanner(cfg.context)}
        <div class="section-card">
            <div class="section-card-header section-card-header--stacked">
                <div class="section-card-header-row">
                    <div>
                        <h2 class="section-card-title">${s.title}</h2>
                        <p class="section-card-subtitle">${s.subtitle}</p>
                    </div>
                    <div class="toolbar-actions">${actions}</div>
                </div>
                <div class="toolbar-row">
                    <input type="text" id="${s.search.id}" class="form-input" placeholder="${s.search.placeholder}">
                    <div class="filter-group" id="order-filters-container">${filters}</div>
                </div>
            </div>
            <div id="${s.contentId}" class="${s.contentClass}"></div>
        </div>
    `;
}

function renderSimpleSectionView(cfg, sectionExtra = '') {
    const s = cfg.section;
    let actionHtml = '';
    if (s.action) {
        actionHtml = `<button class="btn-action-red${s.action.sm ? ' btn-sm' : ''}" id="${s.action.id}">${s.action.label}</button>`;
    }
    if (s.actions) {
        actionHtml = `<div class="toolbar-actions">${s.actions.map(a => {
            const cls = a.variant === 'primary' ? 'btn-action-red btn-sm' : 'btn-secondary btn-sm';
            return `<button class="${cls}" id="${a.id}">${a.label}</button>`;
        }).join('')}</div>`;
    }

    let toolbar = '';
    if (s.scan) {
        toolbar = `
            <div class="toolbar-row">
                <input type="text" id="${s.scan.id}" class="form-input${s.scan.accent ? ' form-input--accent' : ''}" placeholder="${s.scan.placeholder}" autofocus>
                <button class="btn-action-red" id="${s.scanBtn.id}">${s.scanBtn.label}</button>
            </div>
        `;
    }
    if (s.search) {
        toolbar = `
            <div class="toolbar-row">
                <input type="text" id="${s.search.id}" class="form-input" placeholder="${s.search.placeholder}">
                <button class="btn-secondary" id="${s.clearSearch.id}">${s.clearSearch.label}</button>
            </div>
        `;
    }

    const headerClass = toolbar ? ' section-card-header--stacked' : '';
    const contentInner = s.contentText
        ? esc(s.contentText)
        : '';

    return `
        ${renderContextBanner(cfg.context, cfg.contextVariant)}
        <div class="section-card">
            <div class="section-card-header${headerClass}">
                <div class="section-card-header-row">
                    <div>
                        <h2 class="section-card-title">${s.title}</h2>
                        <p class="section-card-subtitle">${s.subtitle}</p>
                    </div>
                    ${actionHtml}
                </div>
                ${toolbar}
            </div>
            ${sectionExtra}
            <div id="${s.contentId}" class="${s.contentClass || ''}">${contentInner}</div>
        </div>
    `;
}

function renderSettingsView(cfg) {
    const blocks = cfg.blocks.map(block => {
        if (block.type === 'radio') {
            const opts = block.options.map(o => `
                <label class="radio-option">
                    <input type="radio" name="${block.name}" value="${o.value}"${o.checked ? ' checked' : ''}>
                    <div>
                        <span class="radio-option-title">${o.title}</span>
                        <p class="radio-option-desc">${o.desc}</p>
                    </div>
                </label>
            `).join('');
            return `
                <div class="settings-block">
                    <h3 class="settings-block-title">${block.title}</h3>
                    <p class="settings-block-desc">${block.desc}</p>
                    <div class="radio-group">${opts}</div>
                </div>
            `;
        }
        return `
            <div class="settings-block">
                <h3 class="settings-block-title">${block.title}</h3>
                <p class="settings-block-desc">${block.desc}</p>
                <label class="checkbox-option">
                    <input type="checkbox" id="${block.id}"${block.checked ? ' checked' : ''}>
                    <span>${block.label}</span>
                </label>
            </div>
        `;
    }).join('');

    return `
        ${renderContextBanner(cfg.context)}
        <div class="section-card">
            ${renderSectionHeader(cfg.section.title, cfg.section.subtitle)}
            <div class="settings-form" id="${cfg.section.contentId}">
                ${blocks}
                <button class="btn-action-red align-self-start" id="${cfg.saveBtn.id}">${cfg.saveBtn.label}</button>
            </div>
        </div>
    `;
}

function renderStaticFeedCard(feed) {
    if (feed.variant === 'danger') {
        return `
            <div class="item-card item-card--danger" data-static-feed>
                <div class="item-card-header">
                    <div class="item-card-body">
                        <span class="item-tag ${feed.tagClass || ''}">${feed.tag}</span>
                        <h3 class="card-title">${feed.title}</h3>
                        <p class="item-card-url item-card-url--danger">${feed.error}</p>
                    </div>
                    <div class="item-card-meta-row">
                        <span class="status-pill status-${feed.status}">${feed.statusLabel}</span>
                        <button class="btn-secondary btn-sm" data-action="restore-feed">↺ Obnovit</button>
                        <button class="btn-secondary btn-sm" data-action="delete-feed" data-msg="Feed Mil-Tec byl odstraněn.">🗑 Smazat</button>
                    </div>
                </div>
            </div>
        `;
    }
    return `
        <div class="item-card item-card--success" data-static-feed>
            <div class="item-card-header">
                <div class="item-card-body">
                    <span class="item-tag">${feed.tag}</span>
                    <h3 class="card-title">${feed.title}</h3>
                    <p class="item-card-url"><b>URL:</b> <code class="code-inline">${feed.url}</code></p>
                </div>
                <div class="item-card-meta-row">
                    <span class="status-pill status-${feed.status}">${feed.statusLabel}</span>
                    <span class="item-card-meta-text">${feed.meta}</span>
                    <button class="btn-secondary btn-sm" data-action="delete-feed" data-msg="Feed ${feed.title} byl odstraněn.">🗑 Smazat</button>
                </div>
            </div>
        </div>
    `;
}

function renderStaticCarrierCard(c) {
    return `
        <div class="item-card item-card--${c.variant}" data-static-carrier>
            <div class="item-card-header">
                <div class="item-card-body">
                    <span class="item-tag">${c.tag}</span>
                    <h3 class="card-title">${c.title}</h3>
                    <p class="item-card-url">${c.desc}</p>
                </div>
                <div class="item-card-meta-row">
                    <span class="status-pill status-${c.status}">${c.statusLabel}</span>
                    <button class="btn-secondary btn-sm" data-action="delete-carrier" data-msg="${esc(c.deleteMsg)}">🗑 Smazat</button>
                </div>
            </div>
        </div>
    `;
}

function renderStaticRuleCard(r) {
    return `
        <div class="item-card item-card--brand" data-static-rule>
            <div class="item-card-header">
                <div class="item-card-body">
                    <span class="item-tag">${r.tag}</span>
                    <h3 class="card-title">${r.title}</h3>
                    <p class="item-card-url">${r.desc}</p>
                </div>
                <div class="item-card-meta-row">
                    <span class="status-pill status-ready">Aktivní</span>
                    <button class="btn-secondary btn-sm" data-action="delete-rule">🗑 Smazat</button>
                </div>
            </div>
        </div>
    `;
}

function renderViewContent(viewId, cfg) {
    switch (viewId) {
        case 'dashboard': return renderDashboardView(cfg);
        case 'availability': return renderAvailabilityView(cfg);
        case 'orders': return renderOrdersView(cfg);
        case 'settings': return renderSettingsView(cfg);
        default: return renderSimpleSectionView(cfg);
    }
}

function renderGuidePanel() {
    const g = UI_GUIDE.panel;
    const steps = g.steps.map((step, i) => {
        const arrow = i < g.steps.length - 1 ? '<div class="step-arrow">&rarr;</div>' : '';
        return `
            ${arrow}
            <div class="step-card${step.ready ? ' step-ready' : ''}">
                <div class="step-badge${step.ready ? ' badge-ready' : ''}">${step.n}</div>
                <div class="step-info">
                    <span class="step-title">${step.title}</span>
                    <span class="step-desc">${step.desc}</span>
                </div>
            </div>
        `;
    }).join('');

    return `
        <div class="workflow-guide-card hidden" id="workflow-guide-panel">
            <div class="guide-header">
                <div>
                    <span class="guide-badge">${g.badge}</span>
                    <h2 class="guide-title">${g.title}</h2>
                    <p class="guide-subtitle">${g.subtitle}</p>
                </div>
                <button class="btn-close-guide" id="btn-close-guide" title="Zavřít průvodce">&times;</button>
            </div>
            <div class="workflow-steps">${steps}</div>
        </div>
    `;
}

function renderSidebar() {
    const navSections = UI_NAV.sections.map(section => {
        const items = section.items.map(item => {
            const badge = item.badgeId
                ? `<span class="nav-badge ${item.badgeClass || ''}" id="${item.badgeId}">0</span>`
                : '';
            const active = item.view === 'dashboard' ? ' active' : '';
            return `
                <button class="nav-item${active}" data-view="${item.view}" type="button">
                    <span class="nav-icon">${item.icon}</span>
                    <span class="nav-label">${item.label}</span>
                    ${badge}
                </button>
            `;
        }).join('');
        const spaced = section.spaced ? ' nav-section-spaced' : '';
        return `
            <div class="nav-section-label${spaced}">${section.label}</div>
            ${items}
        `;
    }).join('');

    const guide = UI_GUIDE.sidebar;
    return `
        <aside class="sidebar">
            <div class="sidebar-brand">
                <div class="brand-badge-red">${UI_BRAND.badge}</div>
                <div class="brand-text">
                    <span class="brand-title">${UI_BRAND.title}</span>
                    <span class="brand-subtitle">${UI_BRAND.subtitle}</span>
                </div>
            </div>
            <div class="tenant-card">
                <div class="tenant-indicator">
                    <span class="tenant-dot" style="background:${UI_TENANT.dotColor}"></span>
                    <span class="tenant-name">${UI_TENANT.name}</span>
                </div>
                <span class="sandbox-pill">${UI_TENANT.sandboxIcon} ${UI_TENANT.sandboxLabel}</span>
            </div>
            <nav class="sidebar-nav">${navSections}</nav>
            <div class="sidebar-footer">
                <div class="sidebar-guide-box">
                    <div class="guide-box-header">
                        <span>${guide.headerIcon} ${guide.header}</span>
                    </div>
                    <p class="guide-box-desc">${guide.description}</p>
                    <button class="btn-guide-toggle" id="btn-guide-toggle" type="button">${guide.toggleShow}</button>
                </div>
            </div>
        </aside>
    `;
}

function renderModals() {
    return `
        <div id="order-modal" class="modal-backdrop modal-backdrop--order" aria-hidden="true">
            <div class="modal-card modal-card--order" role="dialog" aria-labelledby="modal-order-title">
                <header class="order-modal-header">
                    <div class="order-modal-header-main">
                        <span class="modal-eyebrow">${UI_MODALS.order.eyebrow}</span>
                        <h2 class="order-modal-id" id="modal-order-title">—</h2>
                        <p class="order-modal-customer" id="modal-order-customer"></p>
                    </div>
                    <div class="order-modal-header-status" id="modal-order-status"></div>
                    <button class="modal-close" id="${UI_MODALS.order.closeId}" title="Zavřít" aria-label="Zavřít" type="button">&times;</button>
                </header>
                <div class="order-modal-body" id="modal-body"></div>
                <footer class="order-modal-footer" id="modal-footer"></footer>
            </div>
        </div>
        <div id="config-modal" class="modal-backdrop modal-backdrop--order" aria-hidden="true">
            <div class="modal-card modal-card--config" role="dialog">
                <header class="order-modal-header">
                    <div class="order-modal-header-main">
                        <span class="modal-eyebrow" id="config-modal-eyebrow">${UI_MODALS.config.eyebrow}</span>
                        <h2 class="order-modal-id" id="config-modal-title">—</h2>
                    </div>
                    <button class="modal-close" id="${UI_MODALS.config.closeId}" title="Zavřít" aria-label="Zavřít" type="button">&times;</button>
                </header>
                <div class="config-modal-body" id="config-modal-body"></div>
                <footer class="order-modal-footer" id="config-modal-footer"></footer>
            </div>
        </div>
        <div id="feed-modal" class="modal-backdrop">
            <div class="modal-card modal-card--narrow">
                <div class="modal-header">
                    <div>
                        <span class="modal-eyebrow">${UI_MODALS.feed.eyebrow}</span>
                        <h3 class="modal-title">${UI_MODALS.feed.title}</h3>
                    </div>
                    <button class="modal-close" id="${UI_MODALS.feed.closeId}" title="Zavřít okno" type="button">&times;</button>
                </div>
                <div class="modal-body" id="feed-modal-body"></div>
            </div>
        </div>
        <div id="carrier-modal" class="modal-backdrop">
            <div class="modal-card">
                <div class="modal-header">
                    <div>
                        <span class="modal-eyebrow">${UI_MODALS.carrier.eyebrow}</span>
                        <h3 class="modal-title">${UI_MODALS.carrier.title}</h3>
                    </div>
                    <button class="modal-close" id="${UI_MODALS.carrier.closeId}" title="Zavřít okno" type="button">&times;</button>
                </div>
                <div class="modal-body" id="carrier-modal-body"></div>
            </div>
        </div>
        <div id="rule-modal" class="modal-backdrop">
            <div class="modal-card">
                <div class="modal-header">
                    <div>
                        <span class="modal-eyebrow">${UI_MODALS.rule.eyebrow}</span>
                        <h3 class="modal-title">${UI_MODALS.rule.title}</h3>
                    </div>
                    <button class="modal-close" id="${UI_MODALS.rule.closeId}" title="Zavřít okno" type="button">&times;</button>
                </div>
                <div class="modal-body" id="rule-modal-body"></div>
            </div>
        </div>
        <div id="toast-notification" class="toast-notification"></div>
    `;
}

export function buildAppShell() {
    applyTheme();
    const defaultView = UI_VIEWS.dashboard;
    const viewSections = Object.entries(UI_VIEWS).map(([id, cfg]) => `
        <section class="view-section${id === 'dashboard' ? ' active' : ''}" id="view-${id}">
            ${renderViewContent(id, cfg)}
        </section>
    `).join('');

    document.title = UI_BRAND.pageTitle;
    const root = document.getElementById('app-root');
    if (!root) return;

    root.innerHTML = `
        <div class="app-layout">
            ${renderSidebar()}
            <div class="content-area">
                <header class="top-bar">
                    <div class="top-bar-left">
                        <span class="view-eyebrow" id="view-eyebrow">${defaultView.eyebrow}</span>
                        <h1 class="view-title" id="view-title">${defaultView.title}</h1>
                    </div>
                    <div class="top-bar-actions">
                        <button class="btn-secondary" id="${UI_ACTIONS.resetDemo.id}" title="${UI_ACTIONS.resetDemo.title}" type="button">${UI_ACTIONS.resetDemo.label}</button>
                        <button class="btn-action-red" id="${UI_ACTIONS.simCycle.id}" title="${UI_ACTIONS.simCycle.title}" type="button">${UI_ACTIONS.simCycle.label}</button>
                    </div>
                </header>
                <main class="main-viewport">
                    ${renderGuidePanel()}
                    ${viewSections}
                </main>
            </div>
        </div>
        ${renderModals()}
    `;

    populateStaticLists();
    bindStaticListActions();
}

function populateStaticLists() {
    const feedsEl = document.getElementById('feeds-list');
    if (feedsEl) feedsEl.innerHTML = UI_STATIC.feeds.map(renderStaticFeedCard).join('');

    const carriersEl = document.getElementById('carriers-list');
    if (carriersEl) carriersEl.innerHTML = UI_STATIC.carriers.map(renderStaticCarrierCard).join('');

    const rulesEl = document.getElementById('rules-list');
    if (rulesEl) rulesEl.innerHTML = UI_STATIC.rules.map(renderStaticRuleCard).join('');
}

function bindStaticListActions() {
    document.querySelectorAll('[data-action="delete-feed"]').forEach(btn => {
        btn.addEventListener('click', () => {
            btn.closest('.item-card')?.remove();
            if (window.showToast) window.showToast(btn.dataset.msg || 'Feed byl odstraněn.', 'info');
        });
    });

    document.querySelectorAll('[data-action="restore-feed"]').forEach(btn => {
        btn.addEventListener('click', () => {
            const card = btn.closest('.item-card');
            if (!card) return;
            card.className = 'item-card item-card--success';
            const pill = card.querySelector('.status-pill');
            if (pill) { pill.className = 'status-pill status-ready'; pill.textContent = '✓ Synchronizováno'; }
            if (window.showToast) window.showToast('Feed byl obnoven a synchronizován.', 'success');
        });
    });

    document.querySelectorAll('[data-action="delete-carrier"]').forEach(btn => {
        btn.addEventListener('click', () => {
            btn.closest('.item-card')?.remove();
            if (window.showToast) window.showToast(btn.dataset.msg || 'Dopravce byl odstraněn.', 'info');
        });
    });

    document.querySelectorAll('[data-action="delete-rule"]').forEach(btn => {
        btn.addEventListener('click', () => {
            btn.closest('.item-card')?.remove();
            if (window.showToast) window.showToast('Pravidlo bylo odstraněno.', 'info');
        });
    });
}
