// Панель управления ТӨР: вход, каркас, маршруты, живые уведомления, быстрый поиск.
import * as db from '../db.js';
import { $, $$, L, T, EN, esc, money, asset, pimg, digits, toast, run, setRefresh, chime, statusPill, ago } from './ui.js';
import * as dashboard from './dashboard.js';
import * as orders from './orders.js';
import * as analytics from './analytics.js';
import * as products from './products.js';
import * as stock from './stock.js';
import * as customers from './customers.js';
import * as categories from './categories.js';
import * as settings from './settings.js';

const app = $('#app');
const SITE = app.dataset.site;
const LANG_ALT = app.dataset.langAlt;

const PAGES = [
  ['dashboard', 'ph-chart-pie-slice', ['Обзор', 'Overview'], dashboard, true],
  ['orders', 'ph-receipt', ['Заказы', 'Orders'], orders, true],
  ['analytics', 'ph-funnel', ['Аналитика', 'Analytics'], analytics],
  ['products', 'ph-armchair', ['Товары', 'Products'], products, true],
  ['stock', 'ph-package', ['Склад', 'Stock'], stock, true],
  ['customers', 'ph-users-three', ['Клиенты', 'Customers'], customers],
  ['categories', 'ph-squares-four', ['Категории', 'Categories'], categories],
  ['settings', 'ph-gear-six', ['Настройки', 'Settings'], settings],
];
const route = () => { const r = location.hash.replace(/^#\/?/, '').split('/')[0]; return PAGES.some((p) => p[0] === r) ? r : 'dashboard'; };
const langNav = () => `<nav class="lang" aria-label="Language"><a href="${EN ? LANG_ALT : './'}" ${EN ? '' : 'aria-current="page"'}>RU</a><a href="${EN ? './' : LANG_ALT}" ${EN ? 'aria-current="page"' : ''}>EN</a></nav>`;

// ——— Вход
function loginLayout(inner) {
  app.innerHTML = `<div class="login">
    <div class="login-art"><img src="${asset('img/room-b-s.webp')}" alt=""><p>${L('Каталог, склад и заказы — в одном месте', 'Catalogue, stock and orders in one place')}</p></div>
    <div class="login-box"><a class="logo" href="${SITE}">T<span>Ö</span>R</a>${inner}
      <p class="login-foot"><a href="${SITE}" class="muted">← ${L('На сайт', 'Back to the site')}</a> ${langNav()}</p></div>
  </div>`;
}

function renderPin() {
  loginLayout(`<h1>${L('Панель управления', 'Admin panel')}</h1><p>${L('Введите PIN-код сотрудника', 'Enter your staff PIN')}</p>
    <div class="pin" id="pin">${[0, 1, 2, 3].map((i) => `<input inputmode="numeric" maxlength="1" autocomplete="off" aria-label="${L('Цифра', 'Digit')} ${i + 1}">`).join('')}</div>
    <p class="hint">${L('Демо-режим без базы: PIN 1234. Данные хранятся только в этом браузере.', 'Demo mode without a database: PIN 1234. Data stays in this browser.')}</p>`);
  const ins = $$('#pin input');
  ins[0].focus();
  const check = async () => {
    const v = ins.map((i) => i.value).join('');
    if (v.length < 4) return;
    try { await db.auth.signIn(v); boot(); }
    catch (e) { const pin = $('#pin'); pin.classList.remove('err'); void pin.offsetWidth; pin.classList.add('err'); ins.forEach((i) => (i.value = '')); ins[0].focus(); }
  };
  ins.forEach((inp, i) => {
    inp.addEventListener('input', () => { inp.value = inp.value.replace(/\D/g, '').slice(-1); if (inp.value && ins[i + 1]) ins[i + 1].focus(); check(); });
    inp.addEventListener('keydown', (e) => { if (e.key === 'Backspace' && !inp.value && ins[i - 1]) ins[i - 1].focus(); });
    inp.addEventListener('paste', (e) => { const d = digits(e.clipboardData.getData('text')).slice(0, 4); if (!d) return; e.preventDefault(); d.split('').forEach((c, k) => (ins[k].value = c)); check(); });
  });
}

function renderEmail(mode = 'in', note = '') {
  const titles = { in: L('Вход в панель', 'Sign in'), up: L('Первый вход', 'First sign-in'), reset: L('Восстановить пароль', 'Reset password'), recover: L('Новый пароль', 'New password') };
  loginLayout(`<h1>${titles[mode]}</h1>
    ${mode === 'up' ? `<p>${L('Владелец должен заранее добавить ваш email в «Настройки → Команда». Придумайте пароль — мы пришлём письмо для подтверждения.', 'The owner must first add your email in Settings → Team. Choose a password; we will email you a confirmation link.')}</p>` : ''}
    ${mode === 'reset' ? `<p>${L('Пришлём ссылку для смены пароля.', 'We will send a link to change your password.')}</p>` : ''}
    ${note ? `<p class="hint">${note}</p>` : ''}
    <form class="login-form" id="lform" novalidate>
      ${mode !== 'recover' ? `<label class="fld"><span>Email</span><input class="in" type="email" name="email" autocomplete="username" required></label>` : ''}
      ${mode !== 'reset' ? `<label class="fld"><span>${mode === 'in' ? L('Пароль', 'Password') : L('Новый пароль (от 8 символов)', 'New password (8+ characters)')}</span><input class="in" type="password" name="password" autocomplete="${mode === 'in' ? 'current-password' : 'new-password'}" required minlength="${mode === 'in' ? 1 : 8}"></label>` : ''}
      <button class="b pri big" type="submit">${{ in: L('Войти', 'Sign in'), up: L('Создать пароль', 'Create password'), reset: L('Отправить ссылку', 'Send link'), recover: L('Сохранить пароль', 'Save password') }[mode]}</button>
    </form>
    <p class="login-links">${mode !== 'in' ? `<button class="link-btn" type="button" data-mode="in">${L('Уже есть пароль — войти', 'I have a password')}</button>` : `<button class="link-btn" type="button" data-mode="up">${L('Первый вход', 'First sign-in')}</button><button class="link-btn" type="button" data-mode="reset">${L('Забыли пароль?', 'Forgot password?')}</button>`}</p>`);
  const f = $('#lform');
  f.querySelector('input')?.focus();
  app.querySelectorAll('[data-mode]').forEach((b) => b.addEventListener('click', () => renderEmail(b.dataset.mode)));
  f.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = f.email?.value.trim(), password = f.password?.value;
    if (f.email && !/^\S+@\S+\.\S+$/.test(email)) { f.email.setAttribute('aria-invalid', 'true'); f.email.focus(); return; }
    if (f.password && mode !== 'in' && password.length < 8) { f.password.setAttribute('aria-invalid', 'true'); f.password.focus(); toast(L('Пароль — минимум 8 символов', 'Password must be at least 8 characters')); return; }
    const btn = f.querySelector('button');
    if (mode === 'in') { const r = await run(() => db.auth.signIn(email, password), btn); if (r.ok) boot(); }
    else if (mode === 'up') { const r = await run(() => db.auth.signUp(email, password), btn); if (r.ok) r.value.confirm ? renderEmail('in', L(`Письмо отправлено на ${esc(email)}. Перейдите по ссылке из него — и войдите.`, `We emailed ${esc(email)}. Follow the link, then sign in.`)) : boot(); }
    else if (mode === 'reset') { const r = await run(() => db.auth.reset(email), btn); if (r.ok) renderEmail('in', L('Если такой email есть, письмо со ссылкой уже в пути.', 'If this email exists, a reset link is on its way.')); }
    else if (mode === 'recover') { const r = await run(() => db.auth.newPassword(password), btn); if (r.ok) { toast(L('Пароль сохранён', 'Password saved')); boot(); } }
  });
}

function renderNoAccess(email) {
  loginLayout(`<h1>${L('Нет доступа', 'No access')}</h1><p>${L(`Email ${esc(email || '')} не добавлен в команду. Попросите владельца добавить его в «Настройки → Команда», затем войдите снова.`, `${esc(email || 'This email')} is not on the team. Ask the owner to add it in Settings → Team, then sign in again.`)}</p>
    <button class="b" type="button" id="out">${L('Выйти', 'Sign out')}</button>`);
  $('#out').onclick = async () => { await db.auth.signOut(); renderEmail(); };
}

// ——— Каркас
function renderShell() {
  const r = route();
  const meInfo = db.me();
  const main = PAGES.filter((p) => p[4]);
  app.innerHTML = `<div class="shell">
    <aside class="side">
      <a class="logo" href="#/dashboard">T<span>Ö</span>R <small>admin</small></a>
      <button class="side-search" type="button" data-act="palette"><i class="ph ph-magnifying-glass"></i>${L('Поиск', 'Search')}<kbd>${navigator.platform?.includes('Mac') ? '⌘' : 'Ctrl'} K</kbd></button>
      <nav class="side-nav" aria-label="${L('Разделы', 'Sections')}">${PAGES.map(([id, ic, name]) => `<a href="#/${id}" data-page="${id}" ${id === r ? 'aria-current="page"' : ''}><i class="ph ${ic}" aria-hidden="true"></i><span>${T(name)}</span></a>`).join('')}
        <button class="side-more" type="button" data-act="more" aria-label="${L('Ещё', 'More')}"><i class="ph ph-dots-three-outline"></i><span>${L('Ещё', 'More')}</span></button></nav>
      <div class="side-foot">
        <span class="live ${db.MODE}" title="${esc(db.info().label)}"><i></i>${db.MODE === 'remote' ? L('База подключена', 'Database live') : L('Демо-режим', 'Demo mode')}</span>
        <a href="${SITE}" target="_blank" rel="noopener"><i class="ph ph-storefront" aria-hidden="true"></i>${L('Открыть сайт', 'Open the site')}</a>
        <button class="side-link" type="button" data-act="logout"><i class="ph ph-sign-out" aria-hidden="true"></i>${L('Выйти', 'Log out')}${meInfo?.email && meInfo.email !== 'demo' ? `<small>${esc(meInfo.email)}</small>` : ''}</button>
        ${langNav()}
      </div>
    </aside>
    <main class="main">
      <div class="mob-top"><a class="logo" href="#/dashboard">T<span>Ö</span>R</a>
        <div class="mob-acts"><span class="live ${db.MODE}" title="${esc(db.info().label)}"><i></i></span><button class="b ghost icon" type="button" data-act="palette" aria-label="${L('Поиск', 'Search')}"><i class="ph ph-magnifying-glass"></i></button>${langNav()}</div>
      </div>
      <div id="view"></div>
    </main>
  </div>`;
  app.dataset.mainPages = main.map((p) => p[0]).join(',');
  renderView();
}

function renderView() {
  const v = $('#view');
  if (!v) return;
  const r = route();
  const page = PAGES.find((p) => p[0] === r);
  $$('.side-nav a').forEach((a) => (a.dataset.page === r ? a.setAttribute('aria-current', 'page') : a.removeAttribute('aria-current')));
  const fresh = db.orders().filter((o) => o.status === 'new').length;
  const oa = $('.side-nav a[data-page="orders"]');
  if (oa) { oa.querySelector('b')?.remove(); if (fresh) oa.insertAdjacentHTML('beforeend', `<b>${fresh}</b>`); }
  document.title = `${fresh ? `(${fresh}) ` : ''}${T(page[2])} · TÖR admin`;
  const y = scrollY;
  v.onclick = v.onchange = null;
  page[3].render(v);
  if (renderView.same === r) scrollTo(0, y); else scrollTo(0, 0);
  renderView.same = r;
}
setRefresh(renderView);

// ——— Мобильное меню «Ещё»
function openMore() {
  const d = document.createElement('dialog');
  d.className = 'more-menu';
  d.innerHTML = `<nav>${PAGES.filter((p) => !p[4]).map(([id, ic, name]) => `<a href="#/${id}"><i class="ph ${ic}"></i>${T(name)}</a>`).join('')}
    <a href="${SITE}" target="_blank" rel="noopener"><i class="ph ph-storefront"></i>${L('Открыть сайт', 'Open the site')}</a>
    <button type="button" data-act="logout"><i class="ph ph-sign-out"></i>${L('Выйти', 'Log out')}</button></nav>`;
  document.body.append(d); d.showModal();
  d.addEventListener('click', async (e) => {
    if (e.target === d || e.target.closest('a')) d.close();
    if (e.target.closest('[data-act="logout"]')) { d.close(); await logout(); }
  });
  d.addEventListener('close', () => d.remove());
}

// ——— Быстрый поиск (Ctrl/⌘ + K)
function openPalette() {
  if ($('dialog.palette')) return;
  const d = document.createElement('dialog');
  d.className = 'palette';
  d.innerHTML = `<label class="pal-in"><i class="ph ph-magnifying-glass"></i><input type="search" placeholder="${L('Заказ №, клиент, телефон, товар или раздел…', 'Order no., customer, phone, product or section…')}" aria-label="${L('Поиск', 'Search')}"><kbd>Esc</kbd></label><ul class="pal-list" role="listbox"></ul>`;
  document.body.append(d); d.showModal();
  const inp = $('input', d), list = $('.pal-list', d);
  let items = [], sel = 0;
  const draw = () => {
    const q = inp.value.trim().toLowerCase().replace(/^№/, ''), qd = digits(q);
    items = [];
    PAGES.forEach(([id, ic, name]) => { if (!q || T(name).toLowerCase().includes(q)) items.push({ icon: ic, html: `${T(name)}`, sub: L('раздел', 'section'), go: () => (location.hash = '#/' + id) }); });
    if (q) {
      db.orders().filter((o) => String(o.no).includes(q) || o.name.toLowerCase().includes(q) || (qd.length > 2 && digits(o.phone).includes(qd))).slice(0, 6)
        .forEach((o) => items.push({ icon: 'ph-receipt', html: `№${o.no} · ${esc(o.name)} · ${money(o.total)}`, sub: statusPill(o.status) + ' ' + ago(o.ts), go: () => { location.hash = '#/orders'; setTimeout(() => orders.openOrderSheet(o.id), 50); } }));
      db.products().filter((p) => [...p.name, p.sku].join(' ').toLowerCase().includes(q)).slice(0, 6)
        .forEach((p) => items.push({ img: pimg(p), html: `${esc(T(p.name))}`, sub: `${esc(p.sku)} · ${money(p.price)} · ${L('ост.', 'stock')} ${p.stock}`, go: () => { location.hash = '#/products'; setTimeout(() => products.openProductSheet(p.id), 50); } }));
    }
    items.push({ icon: 'ph-plus', html: L('Новый товар', 'New product'), sub: L('действие', 'action'), go: () => { location.hash = '#/products'; setTimeout(() => products.openProductSheet(null), 50); } });
    items.push({ icon: 'ph-storefront', html: L('Продажа в шоуруме', 'In-store sale'), sub: L('действие', 'action'), go: () => { location.hash = '#/orders'; setTimeout(() => orders.openManualOrder(), 50); } });
    items.push({ icon: 'ph-package', html: L('Приход на склад', 'Receive stock'), sub: L('действие', 'action'), go: () => { location.hash = '#/stock'; setTimeout(() => stock.openStockSheet(null, 'in'), 50); } });
    sel = Math.min(sel, items.length - 1);
    list.innerHTML = items.slice(0, 16).map((it, i) => `<li role="option" aria-selected="${i === sel}" data-i="${i}">${it.img ? `<img src="${it.img}" alt="">` : `<i class="ph ${it.icon}"></i>`}<span>${it.html}</span><small>${it.sub}</small></li>`).join('');
  };
  const go = (i) => { const it = items[i]; d.close(); it?.go(); };
  inp.addEventListener('input', () => { sel = 0; draw(); });
  inp.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); sel = Math.min(sel + 1, Math.min(items.length, 16) - 1); draw(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); sel = Math.max(sel - 1, 0); draw(); }
    else if (e.key === 'Enter') { e.preventDefault(); go(sel); }
  });
  list.addEventListener('click', (e) => { const li = e.target.closest('li'); if (li) go(+li.dataset.i); });
  d.addEventListener('click', (e) => { if (e.target === d) d.close(); });
  d.addEventListener('close', () => d.remove());
  draw(); inp.focus();
}

// ——— Новые заказы в реальном времени
let titleBlink;
function announce(o) {
  if (o.source !== 'site') return;
  chime();
  toast(L(`Новый заказ №${o.no} · ${money(o.total)} · ${o.name}`, `New order #${o.no} · ${money(o.total)} · ${o.name}`), L('Открыть', 'Open'), () => { location.hash = '#/orders'; setTimeout(() => orders.openOrderSheet(o.id), 50); }, 12000);
  if ('Notification' in window && Notification.permission === 'granted' && document.hidden) {
    const n = new Notification(L(`Новый заказ №${o.no}`, `New order #${o.no}`), { body: `${o.name} · ${money(o.total)}`, icon: asset('favicon.svg'), tag: 'order-' + o.id });
    n.onclick = () => { window.focus(); location.hash = '#/orders'; setTimeout(() => orders.openOrderSheet(o.id), 50); };
  }
  if (document.hidden) {
    clearInterval(titleBlink);
    let on = false;
    titleBlink = setInterval(() => { document.title = (on = !on) ? L('● Новый заказ!', '● New order!') : 'TÖR admin'; }, 1000);
  }
}
document.addEventListener('visibilitychange', () => { if (!document.hidden) { clearInterval(titleBlink); renderView(); } });

let rerenderTimer;
function onData(e) {
  if (!$('#view')) return;
  if (e.table === 'orders' && e.type === 'INSERT' && e.row) announce(e.row);
  // не перерисовываем раздел, пока сотрудник печатает в форме
  clearTimeout(rerenderTimer);
  rerenderTimer = setTimeout(() => {
    const a = document.activeElement;
    if (a && $('#view').contains(a) && /INPUT|TEXTAREA|SELECT/.test(a.tagName) && a.type !== 'checkbox') { const fresh = db.orders().filter((o) => o.status === 'new').length; document.title = `${fresh ? `(${fresh}) ` : ''}TÖR admin`; return; }
    renderView();
  }, 120);
}

// ——— Запуск
async function logout() { await db.auth.signOut(); boot(); }

app.addEventListener('click', async (e) => {
  const b = e.target.closest('[data-act]');
  if (!b) return;
  if (b.dataset.act === 'logout') await logout();
  if (b.dataset.act === 'palette') openPalette();
  if (b.dataset.act === 'more') openMore();
});
document.addEventListener('keydown', (e) => {
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k' && $('#view')) { e.preventDefault(); openPalette(); }
});
addEventListener('hashchange', () => { if ($('#view')) { $$('dialog[open]').forEach((d) => d.close()); renderView(); } });

let unsub;
async function boot() {
  app.innerHTML = `<div class="boot"><span class="logo">T<span>Ö</span>R</span><i class="ph ph-spinner spin"></i></div>`;
  try {
    const signed = await db.auth.session();
    if (!signed) return db.auth.mode === 'pin' ? renderPin() : renderEmail();
    const ok = await db.init({ admin: true });
    if (!ok) { const u = await db.auth.user?.(); return renderNoAccess(u?.email); }
    unsub?.(); unsub = db.onChange(onData);
    renderShell();
  } catch (err) {
    console.error(err);
    app.innerHTML = `<div class="boot"><p>${esc(db.humanError(err))}</p><button class="b" type="button" onclick="location.reload()">${L('Обновить', 'Reload')}</button></div>`;
  }
}

db.auth.onRecovery?.(() => renderEmail('recover'));
boot();
