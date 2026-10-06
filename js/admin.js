// ТӨР — панель управления: обзор, товары, склад, заказы, категории, настройки.
import * as db from './db.js';

const { L, T, EN, money, num, esc, asset } = db;
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const app = $('#app');
const SITE = app.dataset.site;
const LANG_ALT = app.dataset.langAlt;
const AUTH = 'tor:admin';
const DAY = db.DAY_MS;

const thumb = (p) => asset(/^img\/.+\.webp$/.test(p || '') ? p.replace(/\.webp$/, '-s.webp') : p);
const pimg = (p) => thumb(p?.imgs?.[0]);
const dateFmt = new Intl.DateTimeFormat(EN ? 'en-GB' : 'ru-RU', { day: 'numeric', month: 'short' });
const timeFmt = new Intl.DateTimeFormat(EN ? 'en-GB' : 'ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
const compact = new Intl.NumberFormat(EN ? 'en-US' : 'ru-RU', { notation: 'compact', maximumFractionDigits: 1 });
const fDate = (ts) => dateFmt.format(ts);
const fTime = (ts) => timeFmt.format(ts);
const startOfDay = (ts) => { const d = new Date(ts); d.setHours(0, 0, 0, 0); return d.getTime(); };
const plural = (n, a, b, c) => (EN ? (n === 1 ? a : b) : n % 10 === 1 && n % 100 !== 11 ? a : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20) ? b : c);
const pcs = (n) => num(n) + L(' шт.', ' pcs');
const catName = (id) => T(db.category(id)?.name) || L('Без категории', 'Uncategorised');
const statusName = (s) => T(db.STATUS_NAME[s]);
const authed = () => { try { return sessionStorage.getItem(AUTH) === '1'; } catch (e) { return true; } };

// ——— Общие элементы: тост и подтверждение
let toastTimer;
function toast(msg, action, fn) {
  let t = $('#toast');
  if (!t) { t = document.createElement('div'); t.id = 'toast'; t.className = 'toast'; t.setAttribute('role', 'status'); document.body.append(t); }
  t.innerHTML = `<span>${esc(msg)}</span>` + (action ? `<button type="button">${esc(action)}</button>` : '');
  t.hidden = false; t.style.animation = 'none'; void t.offsetWidth; t.style.animation = '';
  if (action) t.querySelector('button').onclick = () => { t.hidden = true; fn(); };
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (t.hidden = true), action ? 6000 : 3200);
}

function confirmBox({ title, text = '', ok = L('Удалить', 'Delete'), danger = true, extra = '' }) {
  return new Promise((resolve) => {
    const d = document.createElement('dialog');
    d.className = 'confirm';
    d.innerHTML = `<h2>${esc(title)}</h2>${text ? `<p>${esc(text)}</p>` : ''}${extra}
      <div class="acts"><button class="b" type="button" value="0">${L('Отмена', 'Cancel')}</button><button class="b ${danger ? 'danger solid' : 'pri'}" type="button" value="1">${esc(ok)}</button></div>`;
    document.body.append(d);
    d.showModal();
    d.querySelector('.acts .b:last-child').focus();
    let result = false;
    d.addEventListener('click', (e) => {
      const b = e.target.closest('.acts button');
      if (e.target === d) d.close();
      if (!b) return;
      result = b.value === '1' ? d : false;
      d.close();
    });
    d.addEventListener('close', () => { resolve(result); setTimeout(() => d.remove(), 50); });
  });
}

function download(name, text, type = 'text/plain') {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type }));
  a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
const csv = (rows) => '﻿' + rows.map((r) => r.map((v) => { const s = String(v ?? ''); return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; }).join(';')).join('\n');
const stamp = () => new Date().toISOString().slice(0, 10);

function stockPill(p) {
  if (p.stock < 0) return `<span class="pill bad">${L('Долг', 'Owed')} ${-p.stock}</span>`;
  if (p.stock === 0) return `<span class="pill bad">${L('Нет', 'Out')}</span>`;
  if (p.stock <= p.min) return `<span class="pill warn">${p.stock}</span>`;
  return `<span class="pill ok">${p.stock}</span>`;
}

// ——— Вход по PIN (демо-защита, не настоящая авторизация)
function renderLogin() {
  app.innerHTML = `<div class="login">
    <div class="login-art"><img src="${asset('img/room-b-s.webp')}" alt=""><p>${L('Каталог, склад и заказы — в одном месте', 'Catalogue, stock and orders in one place')}</p></div>
    <form class="login-box" id="loginForm">
      <a class="logo" href="${SITE}">T<span>Ö</span>R</a>
      <h1>${L('Панель управления', 'Admin panel')}</h1>
      <p>${L('Введите PIN-код сотрудника', 'Enter your staff PIN')}</p>
      <div class="pin" id="pin">${[0, 1, 2, 3].map((i) => `<input inputmode="numeric" maxlength="1" autocomplete="off" aria-label="${L('Цифра', 'Digit')} ${i + 1}">`).join('')}</div>
      <p class="hint">${L('Демо-доступ: PIN 1234. Сменить можно в настройках.', 'Demo access: PIN 1234. Change it in Settings.')}</p>
      <p><a href="${SITE}" class="muted">← ${L('Вернуться на сайт', 'Back to the site')}</a></p>
    </form>
  </div>`;
  const ins = $$('#pin input');
  ins[0].focus();
  const check = () => {
    const v = ins.map((i) => i.value).join('');
    if (v.length < 4) return;
    if (v === String(db.settings().pin)) {
      try { sessionStorage.setItem(AUTH, '1'); } catch (e) {}
      render();
    } else {
      const pin = $('#pin'); pin.classList.remove('err'); void pin.offsetWidth; pin.classList.add('err');
      ins.forEach((i) => (i.value = '')); ins[0].focus();
    }
  };
  ins.forEach((inp, i) => {
    inp.addEventListener('input', () => { inp.value = inp.value.replace(/\D/g, '').slice(-1); if (inp.value && ins[i + 1]) ins[i + 1].focus(); check(); });
    inp.addEventListener('keydown', (e) => { if (e.key === 'Backspace' && !inp.value && ins[i - 1]) ins[i - 1].focus(); });
    inp.addEventListener('paste', (e) => { const d = (e.clipboardData.getData('text') || '').replace(/\D/g, '').slice(0, 4); if (!d) return; e.preventDefault(); d.split('').forEach((c, k) => (ins[k].value = c)); check(); });
  });
  $('#loginForm').addEventListener('submit', (e) => e.preventDefault());
}

// ——— Каркас
const PAGES = [
  ['dashboard', 'ph-chart-bar', ['Обзор', 'Overview']],
  ['products', 'ph-armchair', ['Товары', 'Products']],
  ['stock', 'ph-package', ['Склад', 'Stock']],
  ['orders', 'ph-receipt', ['Заказы', 'Orders']],
  ['categories', 'ph-squares-four', ['Категории', 'Categories']],
  ['settings', 'ph-gear-six', ['Настройки', 'Settings']],
];
const route = () => { const r = location.hash.replace(/^#\/?/, '').split('/')[0]; return PAGES.some((p) => p[0] === r) ? r : 'dashboard'; };

function renderShell() {
  const newCount = db.orders().filter((o) => o.status === 'new').length;
  const r = route();
  app.innerHTML = `<div class="shell">
    <aside class="side">
      <a class="logo" href="#/dashboard">T<span>Ö</span>R <small>admin</small></a>
      <nav class="side-nav" aria-label="${L('Разделы', 'Sections')}">${PAGES.map(([id, ic, name]) => `<a href="#/${id}" ${id === r ? 'aria-current="page"' : ''}><i class="ph ${ic}" aria-hidden="true"></i>${T(name)}${id === 'orders' && newCount ? `<b>${newCount}</b>` : ''}</a>`).join('')}</nav>
      <div class="side-foot">
        <a href="${SITE}" target="_blank" rel="noopener"><i class="ph ph-storefront" aria-hidden="true"></i>${L('Открыть сайт', 'Open the site')}</a>
        <button class="side-link" type="button" data-act="logout"><i class="ph ph-sign-out" aria-hidden="true"></i>${L('Выйти', 'Log out')}</button>
        <nav class="lang" aria-label="Language"><a href="${EN ? LANG_ALT : './'}" ${EN ? '' : 'aria-current="page"'}>RU</a><a href="${EN ? './' : LANG_ALT}" ${EN ? 'aria-current="page"' : ''}>EN</a></nav>
      </div>
    </aside>
    <main class="main">
      <div class="mob-top"><a class="logo" href="#/dashboard">T<span>Ö</span>R</a>
        <div style="display:flex;gap:4px;align-items:center"><nav class="lang" aria-label="Language"><a href="${EN ? LANG_ALT : './'}" ${EN ? '' : 'aria-current="page"'}>RU</a><a href="${EN ? './' : LANG_ALT}" ${EN ? 'aria-current="page"' : ''}>EN</a></nav>
        <a class="b ghost icon" href="${SITE}" aria-label="${L('Открыть сайт', 'Open the site')}"><i class="ph ph-storefront"></i></a>
        <button class="b ghost icon" type="button" data-act="logout" aria-label="${L('Выйти', 'Log out')}"><i class="ph ph-sign-out"></i></button></div>
      </div>
      <div id="view"></div>
    </main>
  </div>`;
  renderView();
}

const VIEWS = {};
function renderView() {
  const v = $('#view');
  if (!v) return;
  const r = route();
  $$('.side-nav a').forEach((a) => a.toggleAttribute('aria-current', a.getAttribute('href') === '#/' + r));
  $$('.side-nav a[aria-current]').forEach((a) => a.setAttribute('aria-current', 'page'));
  const newCount = db.orders().filter((o) => o.status === 'new').length;
  const oa = $('.side-nav a[href="#/orders"]');
  if (oa) { oa.querySelector('b')?.remove(); if (newCount) oa.insertAdjacentHTML('beforeend', `<b>${newCount}</b>`); }
  VIEWS[r](v);
  document.title = `${T(PAGES.find((p) => p[0] === r)[2])} · TÖR admin`;
}

function render() { authed() ? renderShell() : renderLogin(); }

// ═══════════ ОБЗОР
const dash = { period: 30 };
let chartRO;

VIEWS.dashboard = (v) => {
  const now = Date.now();
  const P = dash.period;
  const start = startOfDay(now) - (P - 1) * DAY;
  const all = db.orders();
  const sales = all.filter((o) => db.isSale(o) && o.ts >= start);
  const prev = all.filter((o) => db.isSale(o) && o.ts >= start - P * DAY && o.ts < start);
  const sum = (a, f) => a.reduce((s, x) => s + f(x), 0);
  const rev = sum(sales, (o) => o.total), prevRev = sum(prev, (o) => o.total);
  const profit = sum(sales, db.orderProfit);
  const goods = sum(sales, (o) => o.total - (o.fee || 0));
  const prods = db.products();
  const stockCost = sum(prods, (p) => Math.max(p.stock, 0) * p.cost);
  const stockRetail = sum(prods, (p) => Math.max(p.stock, 0) * p.price);
  const units = sum(prods, (p) => Math.max(p.stock, 0));
  const delta = (a, b) => { if (!b || prev.length < 3) return ''; const d = Math.round(((a - b) / b) * 100); return `<span class="delta ${d >= 0 ? 'up' : 'down'}">${d >= 0 ? '↑' : '↓'} ${Math.abs(d)}%</span> ${L('к прошлому периоду', 'vs previous period')}`; };

  const days = Array.from({ length: P }, (_, i) => ({ ts: start + i * DAY, rev: 0, n: 0 }));
  for (const o of sales) { const i = Math.floor((startOfDay(o.ts) - start) / DAY); if (days[i]) { days[i].rev += o.total; days[i].n++; } }

  const byP = {}, byC = {};
  for (const o of sales) for (const it of o.items) {
    const k = it.pid;
    (byP[k] ||= { name: T(it.name), rev: 0, qty: 0, p: db.product(k) });
    byP[k].rev += it.price * it.qty; byP[k].qty += it.qty;
    const c = db.product(k)?.cat || '_';
    byC[c] = (byC[c] || 0) + it.price * it.qty;
  }
  const top = Object.values(byP).sort((a, b) => b.rev - a.rev).slice(0, 6);
  const cats = Object.entries(byC).sort((a, b) => b[1] - a[1]);
  const maxTop = top[0]?.rev || 1, maxCat = cats[0]?.[1] || 1;
  const fresh = all.filter((o) => o.status === 'new');
  const low = prods.filter((p) => p.stock <= p.min).sort((a, b) => a.stock - a.min - (b.stock - b.min)).slice(0, 7);

  v.innerHTML = `
    <div class="page-head"><h1>${L('Обзор', 'Overview')}<small>${L('Продажи без учёта отменённых заказов', 'Sales excluding canceled orders')}</small></h1>
      <div class="tg" role="group" aria-label="${L('Период', 'Period')}">${[7, 30].map((d) => `<button type="button" data-period="${d}" aria-pressed="${P === d}">${d} ${L('дней', 'days')}</button>`).join('')}</div>
    </div>
    <div class="tiles">
      <div class="tile"><span class="tile-label"><i class="ph ph-currency-circle-dollar"></i>${L('Выручка', 'Revenue')}</span><span class="tile-value">${money(rev)}</span><span class="tile-sub">${delta(rev, prevRev) || L(`за ${P} дней`, `last ${P} days`)}</span></div>
      <div class="tile"><span class="tile-label"><i class="ph ph-receipt"></i>${L('Заказы', 'Orders')}</span><span class="tile-value">${sales.length}</span><span class="tile-sub">${L('Средний чек', 'Average order')} ${money(sales.length ? rev / sales.length : 0)}</span></div>
      <div class="tile"><span class="tile-label"><i class="ph ph-trend-up"></i>${L('Валовая прибыль', 'Gross profit')}</span><span class="tile-value">${money(profit)}</span><span class="tile-sub">${L('Маржа', 'Margin')} ${goods ? Math.round((profit / goods) * 100) : 0}%</span></div>
      <div class="tile"><span class="tile-label"><i class="ph ph-package"></i>${L('Склад по себестоимости', 'Stock at cost')}</span><span class="tile-value">${money(stockCost)}</span><span class="tile-sub">${pcs(units)} · ${L('в рознице', 'retail')} ${money(stockRetail)}</span></div>
    </div>
    <div class="cols">
      <section class="panel"><div class="panel-head"><h2>${L('Выручка по дням', 'Revenue by day')}</h2><p>${L('Наведите на столбец', 'Hover a bar for details')}</p></div><div class="chart" id="chart"></div></section>
      <section class="panel"><div class="panel-head"><h2>${L('Требует внимания', 'Needs attention')}</h2><a class="b sm" href="#/orders">${L('Все заказы', 'All orders')}</a></div>
        <ul class="alist">
          ${fresh.length ? `<li><span class="pill acc plain" style="width:40px;justify-content:center">${fresh.length}</span><div><p class="al-name">${L(`${plural(fresh.length, 'Новый заказ', 'Новых заказа', 'Новых заказов')}`, fresh.length === 1 ? 'New order' : 'New orders')}</p><p class="al-sub">${L('Позвоните клиентам и подтвердите', 'Call the customers and confirm')}</p></div><a class="b sm pri" href="#/orders/new">${L('Открыть', 'Open')}</a></li>` : ''}
          ${low.map((p) => `<li><img src="${pimg(p)}" alt=""><div><p class="al-name">${esc(T(p.name))}</p><p class="al-sub">${p.stock <= 0 ? L(`Нет в наличии${p.stock < 0 ? `, должны клиентам ${-p.stock}` : ''}`, `Out of stock${p.stock < 0 ? `, owed ${-p.stock}` : ''}`) : L(`Осталось ${p.stock}, порог ${p.min}`, `${p.stock} left, threshold ${p.min}`)}</p></div><button class="b sm" type="button" data-receive="${p.id}"><i class="ph ph-plus"></i>${L('Приход', 'Receive')}</button></li>`).join('')}
        </ul>
        ${!fresh.length && !low.length ? `<p class="empty-note"><i class="ph-fill ph-check-circle"></i>${L('Всё спокойно', 'All good')}</p>` : ''}
      </section>
    </div>
    <div class="cols even">
      <section class="panel"><div class="panel-head"><h2>${L('Лидеры продаж', 'Top sellers')}</h2><p>${L('по выручке', 'by revenue')}</p></div>
        <ul class="hbars">${top.map((t) => `<li><span class="hb-name">${esc(t.name)} <span class="muted">· ${pcs(t.qty)}</span></span><span class="hb-val">${money(t.rev)}</span><span class="hb-track"><i style="--w:${(t.rev / maxTop) * 100}%"></i></span></li>`).join('') || `<li class="muted">${L('Нет продаж за период', 'No sales in this period')}</li>`}</ul></section>
      <section class="panel"><div class="panel-head"><h2>${L('Продажи по категориям', 'Sales by category')}</h2><p>${L('доля выручки', 'share of revenue')}</p></div>
        <ul class="hbars">${cats.map(([c, r]) => `<li><span class="hb-name">${esc(c === '_' ? L('Удалённые товары', 'Deleted products') : catName(c))}</span><span class="hb-val">${money(r)} · ${goods ? Math.round((r / goods) * 100) : 0}%</span><span class="hb-track"><i style="--w:${(r / maxCat) * 100}%"></i></span></li>`).join('') || `<li class="muted">${L('Нет продаж за период', 'No sales in this period')}</li>`}</ul></section>
    </div>`;

  const ch = $('#chart', v);
  const draw = () => drawBars(ch, days, P);
  draw();
  chartRO?.disconnect();
  chartRO = new ResizeObserver(() => draw());
  chartRO.observe(ch);
};

function niceMax(v) {
  if (v <= 0) return 1;
  const e = Math.pow(10, Math.floor(Math.log10(v)));
  const f = v / e;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * e;
}

function drawBars(el, days, P) {
  const W = el.clientWidth || 600;
  const H = matchMedia('(max-width: 520px)').matches ? 200 : 240;
  const pl = 52, pr = 4, pt = 10, pb = 26;
  const pw = W - pl - pr, ph = H - pt - pb;
  const max = niceMax(Math.max(...days.map((d) => d.rev)) * 1.05);
  const band = pw / days.length;
  const bw = Math.min(24, band * 0.66);
  const y = (val) => pt + ph - (val / max) * ph;
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((k) => k * max);
  const every = P > 14 ? (W < 500 ? 7 : 5) : 1;
  let s = `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="${L('Выручка по дням', 'Revenue by day')}">`;
  s += ticks.map((t) => `<line class="grid-l" x1="${pl}" x2="${W - pr}" y1="${y(t)}" y2="${y(t)}"/><text class="axis-t" x="${pl - 8}" y="${y(t) + 4}" text-anchor="end">${t ? compact.format(t) : '0'}</text>`).join('');
  days.forEach((d, i) => {
    const cx = pl + band * i + band / 2;
    const h = Math.max(0, ph - (y(d.rev) - pt));
    if (h > 0) {
      const r = Math.min(4, h, bw / 2), x0 = cx - bw / 2, yb = pt + ph, yt = yb - h;
      s += `<path class="bar" data-i="${i}" d="M${x0},${yb}V${yt + r}Q${x0},${yt} ${x0 + r},${yt}H${x0 + bw - r}Q${x0 + bw},${yt} ${x0 + bw},${yt + r}V${yb}Z"/>`;
    }
    if ((days.length - 1 - i) % every === 0) s += `<text class="axis-t" x="${cx}" y="${H - 6}" text-anchor="middle">${P > 7 ? fDate(d.ts).replace('.', '') : new Intl.DateTimeFormat(EN ? 'en-GB' : 'ru-RU', { weekday: 'short' }).format(d.ts)}</text>`;
    s += `<rect class="hit" data-i="${i}" x="${pl + band * i}" y="${pt}" width="${band}" height="${ph}"/>`;
  });
  s += '</svg><div class="chart-tip" hidden></div>';
  el.innerHTML = s;
  const tip = $('.chart-tip', el);
  const show = (i) => {
    const d = days[i];
    $$('.bar', el).forEach((b) => b.classList.toggle('dim', +b.dataset.i !== i));
    tip.innerHTML = `${fDate(d.ts)}<br><b>${money(d.rev)}</b><br>${d.n} ${EN ? (d.n === 1 ? 'order' : 'orders') : plural(d.n, 'заказ', 'заказа', 'заказов')}`;
    tip.hidden = false;
    tip.style.left = Math.min(Math.max(pl + band * i + band / 2, 70), W - 70) + 'px';
    tip.style.top = Math.min(y(d.rev), pt + ph - 10) + 'px';
  };
  el.onpointermove = (e) => { const h = e.target.closest('.hit'); if (h) show(+h.dataset.i); };
  el.onpointerleave = () => { tip.hidden = true; $$('.bar', el).forEach((b) => b.classList.remove('dim')); };
}

// ═══════════ ТОВАРЫ
const pr = { q: '', cat: 'all', filter: 'all', sort: 'created', dir: -1, sel: new Set() };

function productRows() {
  const q = pr.q.trim().toLowerCase();
  let list = db.products().filter((p) => {
    if (pr.cat !== 'all' && p.cat !== pr.cat) return false;
    if (pr.filter === 'low' && !(p.stock > 0 && p.stock <= p.min)) return false;
    if (pr.filter === 'out' && p.stock > 0) return false;
    if (pr.filter === 'hidden' && p.visible) return false;
    if (pr.filter === 'sale' && !(p.old > p.price)) return false;
    if (q && ![...p.name, p.sku, ...p.mat].join(' ').toLowerCase().includes(q)) return false;
    return true;
  });
  const key = { name: (p) => T(p.name).toLowerCase(), price: (p) => p.price, stock: (p) => p.stock, margin: (p) => (p.price ? (p.price - p.cost) / p.price : 0), created: (p) => p.created, cat: (p) => catName(p.cat) }[pr.sort];
  return list.sort((a, b) => { const x = key(a), y = key(b); return (x > y ? 1 : x < y ? -1 : 0) * pr.dir; });
}

VIEWS.products = (v) => {
  const all = db.products();
  const counts = { low: all.filter((p) => p.stock > 0 && p.stock <= p.min).length, out: all.filter((p) => p.stock <= 0).length, hidden: all.filter((p) => !p.visible).length };
  v.innerHTML = `
    <div class="page-head"><h1>${L('Товары', 'Products')}<small>${all.length} ${L(plural(all.length, 'позиция', 'позиции', 'позиций'), 'items')} · ${L('на сайте', 'live')} ${all.length - counts.hidden}</small></h1>
      <button class="b" type="button" data-act="export-products"><i class="ph ph-download-simple"></i><span>CSV</span></button>
      <button class="b pri" type="button" data-act="new-product"><i class="ph ph-plus"></i><span>${L('Добавить товар', 'Add product')}</span></button>
    </div>
    <div class="toolbar-a">
      <label class="search-in"><i class="ph ph-magnifying-glass"></i><input class="in" type="search" id="pq" value="${esc(pr.q)}" placeholder="${L('Название, артикул, материал', 'Name, SKU, material')}" aria-label="${L('Поиск', 'Search')}"></label>
      <select class="sel" id="pcat" aria-label="${L('Категория', 'Category')}"><option value="all">${L('Все категории', 'All categories')}</option>${db.categories().map((c) => `<option value="${c.id}" ${pr.cat === c.id ? 'selected' : ''}>${esc(T(c.name))}</option>`).join('')}</select>
      <select class="sel" id="pfilter" aria-label="${L('Фильтр', 'Filter')}">
        ${[['all', L('Все товары', 'All products')], ['low', L(`Заканчиваются (${counts.low})`, `Running low (${counts.low})`)], ['out', L(`Нет в наличии (${counts.out})`, `Out of stock (${counts.out})`)], ['hidden', L(`Скрыты с сайта (${counts.hidden})`, `Hidden (${counts.hidden})`)], ['sale', L('Со скидкой', 'On sale')]].map(([k, n]) => `<option value="${k}" ${pr.filter === k ? 'selected' : ''}>${n}</option>`).join('')}
      </select>
    </div>
    <div id="ptable"></div>`;
  renderProductTable();
  $('#pq', v).addEventListener('input', (e) => { pr.q = e.target.value; renderProductTable(); });
  $('#pcat', v).addEventListener('change', (e) => { pr.cat = e.target.value; renderProductTable(); });
  $('#pfilter', v).addEventListener('change', (e) => { pr.filter = e.target.value; renderProductTable(); });
};

function renderProductTable() {
  const box = $('#ptable');
  if (!box) return;
  const rows = productRows();
  for (const id of [...pr.sel]) if (!db.product(id)) pr.sel.delete(id);
  const th = (k, label, cls = '') => `<th class="${cls}"><button type="button" data-sort="${k}">${label}${pr.sort === k ? `<i class="ph ph-caret-${pr.dir > 0 ? 'up' : 'down'}"></i>` : ''}</button></th>`;
  const allSel = rows.length && rows.every((p) => pr.sel.has(p.id));
  box.innerHTML = rows.length ? `<div class="tbl-wrap"><table class="tbl tbl-cards">
    <thead><tr><th class="w0"><input type="checkbox" data-selall ${allSel ? 'checked' : ''} aria-label="${L('Выбрать все', 'Select all')}"></th>${th('name', L('Товар', 'Product'))}${th('cat', L('Категория', 'Category'), 'hide-md')}${th('price', L('Цена', 'Price'), 'n')}<th class="n hide-md">${L('Себест.', 'Cost')}</th>${th('margin', L('Маржа', 'Margin'), 'n')}${th('stock', L('Остаток', 'Stock'), 'c')}<th class="c">${L('На сайте', 'Live')}</th><th class="w0"></th></tr></thead>
    <tbody>${rows.map((p) => {
      const m = p.price ? Math.round(((p.price - p.cost) / p.price) * 100) : 0;
      return `<tr class="clickable ${pr.sel.has(p.id) ? 'sel-row' : ''}" data-edit="${p.id}">
        <td class="w0"><input type="checkbox" data-sel="${p.id}" ${pr.sel.has(p.id) ? 'checked' : ''} aria-label="${L('Выбрать', 'Select')}"></td>
        <td><div class="prod-cell"><img src="${pimg(p)}" alt="" loading="lazy"><div><b>${esc(T(p.name))}</b><small>${esc(p.sku)}${p.tags.includes('new') ? ' · ' + L('новинка', 'new') : ''}${p.tags.includes('hit') ? ' · ' + L('хит', 'bestseller') : ''}</small></div></div></td>
        <td class="hide-md m-hide">${esc(catName(p.cat))}</td>
        <td class="n m-meta" data-l="${L('Цена', 'Price')}">${money(p.price)}${p.old > p.price ? `<s class="muted">${money(p.old)}</s>` : ''}</td>
        <td class="n hide-md m-hide">${money(p.cost)}</td>
        <td class="n m-hide"><span class="${m < 30 ? 'qty-minus' : ''}">${m}%</span></td>
        <td class="c m-r1c3">${stockPill(p)}</td>
        <td class="c m-hide"><label class="switch" title="${L('Показывать на сайте', 'Show on the site')}"><input type="checkbox" data-vis="${p.id}" ${p.visible ? 'checked' : ''} aria-label="${L('Показывать на сайте', 'Show on the site')}"></label></td>
        <td class="w0 m-hide"><div style="display:flex;gap:2px"><button class="b ghost icon" type="button" data-receive="${p.id}" title="${L('Приход', 'Receive')}" aria-label="${L('Приход', 'Receive')}"><i class="ph ph-plus-circle"></i></button><button class="b ghost icon" type="button" data-dup="${p.id}" title="${L('Дублировать', 'Duplicate')}" aria-label="${L('Дублировать', 'Duplicate')}"><i class="ph ph-copy"></i></button><button class="b ghost icon danger" type="button" data-del="${p.id}" title="${L('Удалить', 'Delete')}" aria-label="${L('Удалить', 'Delete')}"><i class="ph ph-trash"></i></button></div></td>
      </tr>`;
    }).join('')}</tbody></table></div>` : `<div class="panel"><p class="empty-note">${L('Ничего не найдено. Измените фильтры или добавьте товар.', 'Nothing found. Change the filters or add a product.')}</p></div>`;
  if (pr.sel.size) box.insertAdjacentHTML('beforeend', `<div class="bulk" role="region" aria-label="${L('Действия с выбранными', 'Bulk actions')}"><span>${L('Выбрано', 'Selected')}: ${pr.sel.size}</span>
    <button class="b sm" type="button" data-bulk="show"><i class="ph ph-eye"></i>${L('Показать', 'Show')}</button>
    <button class="b sm" type="button" data-bulk="hide"><i class="ph ph-eye-slash"></i>${L('Скрыть', 'Hide')}</button>
    <button class="b sm" type="button" data-bulk="del"><i class="ph ph-trash"></i>${L('Удалить', 'Delete')}</button>
    <button class="b sm ghost icon" type="button" data-bulk="clear" aria-label="${L('Снять выделение', 'Clear selection')}"><i class="ph ph-x"></i></button></div>`);
}

async function deleteProducts(ids) {
  const names = ids.map((id) => T(db.product(id)?.name));
  const ok = await confirmBox({
    title: ids.length === 1 ? L(`Удалить «${names[0]}»?`, `Delete “${names[0]}”?`) : L(`Удалить ${ids.length} товаров?`, `Delete ${ids.length} products?`),
    text: L('Товар пропадёт с сайта и из списка. История продаж и движения по складу сохранятся. Если нужно просто убрать с витрины — лучше скрыть.', 'The product disappears from the site and the list. Sales history and stock movements are kept. To just take it off the site, hide it instead.'),
  });
  if (!ok) return;
  const snaps = ids.map((id) => db.removeProduct(id)).filter(Boolean).reverse();
  pr.sel.clear();
  toast(ids.length === 1 ? L('Товар удалён', 'Product deleted') : L(`Удалено: ${ids.length}`, `Deleted: ${ids.length}`), L('Отменить', 'Undo'), () => { snaps.reverse().forEach((s) => db.restoreProduct(s)); toast(L('Восстановлено', 'Restored')); });
}

// ——— Редактор товара
let draft = null;

function openProductSheet(id, base) {
  const p = id ? db.product(id) : null;
  draft = p ? structuredClone(p) : base || {
    name: ['', ''], desc: ['', ''], mat: ['', ''], cat: pr.cat !== 'all' ? pr.cat : db.categories()[0]?.id, sku: '', price: '', old: '', cost: '',
    stock: '', min: 2, lead: 14, dims: ['', '', ''], colors: [['#CDBBA0', 'Песок', 'Sand']], tags: [], imgs: [], visible: true,
  };
  if (!p && !draft.sku) draft.sku = db.nextSku(draft.cat);
  const d = sheet(`<div class="sh-head"><h2>${p ? esc(T(p.name)) : L('Новый товар', 'New product')}<small>${p ? esc(p.sku) + ' · ' + L('добавлен', 'added') + ' ' + fDate(p.created) : L('Заполните хотя бы название, категорию и цену', 'At least a name, category and price')}</small></h2>
      ${p ? `<a class="b sm" href="${SITE}#${p.id}" target="_blank" rel="noopener"><i class="ph ph-arrow-square-out"></i>${L('На сайте', 'View')}</a>` : ''}
      <button class="b ghost icon" type="button" data-close aria-label="${L('Закрыть', 'Close')}"><i class="ph ph-x"></i></button></div>
    <form class="sh-body" id="pform" novalidate></form>
    <div class="sh-foot">${p ? `<button class="b danger" type="button" data-act="sheet-del"><i class="ph ph-trash"></i>${L('Удалить', 'Delete')}</button>` : ''}<span class="grow"></span>
      <button class="b" type="button" data-close>${L('Отмена', 'Cancel')}</button><button class="b pri" type="submit" form="pform">${p ? L('Сохранить', 'Save') : L('Добавить', 'Add')}</button></div>`);
  renderPForm();
  const f = $('#pform', d);
  f.addEventListener('input', onPInput);
  f.addEventListener('change', onPInput);
  f.addEventListener('click', onPClick);
  f.addEventListener('submit', (e) => { e.preventDefault(); saveDraft(d); });
  const drop = (e) => { e.preventDefault(); $('.img-add', d)?.classList.remove('drag'); if (e.type === 'drop') addFiles(e.dataTransfer.files); };
  f.addEventListener('dragover', (e) => { if (e.target.closest('.imgs')) { e.preventDefault(); $('.img-add', d).classList.add('drag'); } });
  f.addEventListener('dragleave', (e) => { if (e.target.closest('.img-add')) $('.img-add', d).classList.remove('drag'); });
  f.addEventListener('drop', drop);
  $('[data-act="sheet-del"]', d)?.addEventListener('click', async () => { d.close(); await deleteProducts([p.id]); });
  setTimeout(() => (p ? null : $('[data-k="name.0"]', d)?.focus()), 60);
}

function renderPForm() {
  const f = $('#pform');
  const x = draft;
  const isNew = !x.id;
  const m = +x.price ? Math.round(((+x.price - +x.cost) / +x.price) * 100) : null;
  f.innerHTML = `
    <section class="sec"><h3>${L('Фото', 'Photos')}<small class="muted" style="text-transform:none;letter-spacing:0">${L('первое — обложка', 'first one is the cover')}</small></h3>
      <div class="imgs">${x.imgs.map((im, i) => `<div class="img-tile"><img src="${thumb(im)}" alt="">${i === 0 ? `<span class="main-tag">${L('обложка', 'cover')}</span>` : ''}<div class="img-acts">${i ? `<button type="button" data-img-main="${i}" title="${L('Сделать обложкой', 'Make cover')}" aria-label="${L('Сделать обложкой', 'Make cover')}"><i class="ph ph-star"></i></button>` : ''}<button type="button" data-img-del="${i}" title="${L('Удалить фото', 'Remove photo')}" aria-label="${L('Удалить фото', 'Remove photo')}"><i class="ph ph-trash"></i></button></div></div>`).join('')}
        <label class="img-add"><i class="ph ph-image-square"></i>${L('Загрузить или перетащить', 'Upload or drop')}<input type="file" accept="image/*" multiple data-files></label></div>
      <div class="add-line" style="grid-template-columns:minmax(0,1fr) auto"><input class="in" type="url" data-url placeholder="${L('…или ссылка на фото https://', '…or an image link https://')}"><button class="b" type="button" data-add-url>${L('Добавить', 'Add')}</button></div>
    </section>
    <section class="sec"><h3>${L('Основное', 'Basics')}</h3>
      <div class="row"><label class="fld"><span>${L('Название', 'Name')} RU <em>*</em></span><input class="in" data-k="name.0" value="${esc(x.name[0])}" required></label><label class="fld"><span>${L('Название', 'Name')} EN</span><input class="in" data-k="name.1" value="${esc(x.name[1])}"></label></div>
      <div class="row"><label class="fld"><span>${L('Категория', 'Category')}</span><select class="sel" data-k="cat">${db.categories().map((c) => `<option value="${c.id}" ${x.cat === c.id ? 'selected' : ''}>${esc(T(c.name))}</option>`).join('')}</select></label>
        <label class="fld"><span>${L('Артикул', 'SKU')}</span><input class="in" data-k="sku" value="${esc(x.sku)}"></label></div>
      <div class="chips-a">${[['new', L('Новинка', 'New')], ['hit', L('Хит продаж', 'Bestseller')]].map(([t, n]) => `<label class="chip-a"><input type="checkbox" data-tag="${t}" ${x.tags.includes(t) ? 'checked' : ''}>${n}</label>`).join('')}
        <label class="switch" style="margin-left:auto"><input type="checkbox" data-k="visible" ${x.visible ? 'checked' : ''}>${L('Показывать на сайте', 'Show on the site')}</label></div>
    </section>
    <section class="sec"><h3>${L('Цена', 'Pricing')}</h3>
      <div class="row" style="--c:3"><label class="fld"><span>${L('Цена, ₸', 'Price, ₸')} <em>*</em></span><input class="in" type="number" min="0" step="1000" inputmode="numeric" data-k="price" value="${x.price}"></label>
        <label class="fld"><span>${L('Старая цена', 'Was price')}</span><input class="in" type="number" min="0" step="1000" inputmode="numeric" data-k="old" value="${x.old || ''}" placeholder="${L('для скидки', 'for a sale')}"></label>
        <label class="fld"><span>${L('Себестоимость', 'Unit cost')}</span><input class="in" type="number" min="0" step="500" inputmode="numeric" data-k="cost" value="${x.cost}"></label></div>
      <p class="calc" id="calc">${m == null ? L('Введите цену и себестоимость — посчитаем маржу.', 'Enter price and cost to see the margin.') : L(`Маржа <b>${m}%</b> · прибыль с единицы <b>${money(+x.price - +x.cost)}</b>`, `Margin <b>${m}%</b> · profit per unit <b>${money(+x.price - +x.cost)}</b>`) + (+x.old > +x.price ? L(` · скидка <b>${Math.round((1 - x.price / x.old) * 100)}%</b>`, ` · discount <b>${Math.round((1 - x.price / x.old) * 100)}%</b>`) : '')}</p>
    </section>
    <section class="sec"><h3>${L('Склад', 'Stock')}</h3>
      <div class="row" style="--c:3">${isNew ? `<label class="fld"><span>${L('Начальный остаток', 'Opening stock')}</span><input class="in" type="number" min="0" inputmode="numeric" data-k="stock" value="${x.stock}" placeholder="0"></label>` : `<div class="fld"><span>${L('Остаток сейчас', 'In stock now')}</span><div style="display:flex;gap:8px;align-items:center;height:40px">${stockPill(x)}<button class="b sm" type="button" data-receive="${x.id}">${L('Движение', 'Adjust')}</button></div></div>`}
        <label class="fld"><span>${L('Порог «мало»', 'Low threshold')}</span><input class="in" type="number" min="0" inputmode="numeric" data-k="min" value="${x.min}"></label>
        <label class="fld"><span>${L('Под заказ, дней', 'Lead time, days')}</span><input class="in" type="number" min="1" inputmode="numeric" data-k="lead" value="${x.lead}"></label></div>
    </section>
    <section class="sec"><h3>${L('Размеры и материалы', 'Size & materials')}</h3>
      <div class="row" style="--c:3">${[L('Ширина', 'Width'), L('Глубина', 'Depth'), L('Высота', 'Height')].map((n, i) => `<label class="fld"><span>${n}, ${L('см', 'cm')}</span><input class="in" type="number" min="0" inputmode="numeric" data-k="dims.${i}" value="${x.dims[i] ?? ''}"></label>`).join('')}</div>
      <div class="row"><label class="fld"><span>${L('Материалы', 'Materials')} RU</span><input class="in" data-k="mat.0" value="${esc(x.mat[0])}"></label><label class="fld"><span>${L('Материалы', 'Materials')} EN</span><input class="in" data-k="mat.1" value="${esc(x.mat[1])}"></label></div>
      <div class="row r1"><label class="fld"><span>${L('Описание', 'Description')} RU</span><textarea class="ta" data-k="desc.0">${esc(x.desc[0])}</textarea></label></div>
      <div class="row r1"><label class="fld"><span>${L('Описание', 'Description')} EN</span><textarea class="ta" data-k="desc.1">${esc(x.desc[1])}</textarea></label></div>
    </section>
    <section class="sec"><h3>${L('Цвета и обивка', 'Colours & finishes')}<button class="b sm" type="button" data-color-add><i class="ph ph-plus"></i>${L('Цвет', 'Colour')}</button></h3>
      ${x.colors.map((c, i) => `<div class="color-row"><input type="color" data-color="${i}.0" value="${c[0]}" aria-label="${L('Цвет', 'Colour')}"><input class="in" data-color="${i}.1" value="${esc(c[1])}" placeholder="${L('Название RU', 'Name RU')}"><input class="in" data-color="${i}.2" value="${esc(c[2])}" placeholder="${L('Название EN', 'Name EN')}"><button class="b ghost icon" type="button" data-color-del="${i}" aria-label="${L('Убрать цвет', 'Remove colour')}"><i class="ph ph-x"></i></button></div>`).join('') || `<p class="muted">${L('Без вариантов цвета', 'No colour options')}</p>`}
    </section>`;
}

function onPInput(e) {
  const el = e.target;
  if (el.dataset.k) {
    const [k, i] = el.dataset.k.split('.');
    const val = el.type === 'checkbox' ? el.checked : el.type === 'number' ? (el.value === '' ? '' : +el.value) : el.value;
    if (i != null) draft[k][+i] = val; else draft[k] = val;
    el.removeAttribute('aria-invalid');
    if (k === 'cat' && !draft.id) { draft.sku = db.nextSku(draft.cat); $('[data-k="sku"]').value = draft.sku; }
    if (['price', 'cost', 'old'].includes(k)) {
      const m = +draft.price ? Math.round(((+draft.price - +draft.cost) / +draft.price) * 100) : null;
      $('#calc').innerHTML = m == null ? L('Введите цену и себестоимость — посчитаем маржу.', 'Enter price and cost to see the margin.') : L(`Маржа <b>${m}%</b> · прибыль с единицы <b>${money(+draft.price - +draft.cost)}</b>`, `Margin <b>${m}%</b> · profit per unit <b>${money(+draft.price - +draft.cost)}</b>`) + (+draft.old > +draft.price ? L(` · скидка <b>${Math.round((1 - draft.price / draft.old) * 100)}%</b>`, ` · discount <b>${Math.round((1 - draft.price / draft.old) * 100)}%</b>`) : '');
    }
  } else if (el.dataset.tag && e.type === 'change') {
    const t = el.dataset.tag;
    draft.tags = el.checked ? [...new Set([...draft.tags, t])] : draft.tags.filter((x) => x !== t);
  } else if (el.dataset.color) {
    const [i, j] = el.dataset.color.split('.');
    draft.colors[+i][+j] = el.value;
  } else if (el.dataset.files != null && e.type === 'change') {
    addFiles(el.files);
  }
}

function onPClick(e) {
  const b = e.target.closest('button');
  if (!b) return;
  if (b.dataset.imgDel) { draft.imgs.splice(+b.dataset.imgDel, 1); renderPForm(); }
  else if (b.dataset.imgMain) { const [im] = draft.imgs.splice(+b.dataset.imgMain, 1); draft.imgs.unshift(im); renderPForm(); }
  else if (b.dataset.colorAdd != null) { draft.colors.push(['#A8A39B', '', '']); renderPForm(); }
  else if (b.dataset.colorDel) { draft.colors.splice(+b.dataset.colorDel, 1); renderPForm(); }
  else if (b.dataset.addUrl != null) {
    const inp = $('[data-url]');
    const u = inp.value.trim();
    if (!/^https?:\/\/.+/i.test(u)) { inp.setAttribute('aria-invalid', 'true'); toast(L('Нужна ссылка, начинающаяся с https://', 'Link must start with https://')); return; }
    draft.imgs.push(u); renderPForm();
  }
}

// Фото сжимаем до 1000 px, чтобы влезть в хранилище браузера
async function addFiles(files) {
  for (const file of [...files].filter((f) => f.type.startsWith('image/')).slice(0, 8)) {
    try {
      const bmp = await createImageBitmap(file);
      const k = Math.min(1, 1000 / Math.max(bmp.width, bmp.height));
      const c = document.createElement('canvas');
      c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
      c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
      let url = c.toDataURL('image/webp', 0.8);
      if (!url.startsWith('data:image/webp')) url = c.toDataURL('image/jpeg', 0.82);
      draft.imgs.push(url);
    } catch (err) { toast(L('Не удалось прочитать файл: ', 'Could not read file: ') + file.name); }
  }
  renderPForm();
}

function saveDraft(d) {
  const x = draft;
  const bad = [];
  if (!String(x.name[0]).trim()) bad.push('name.0');
  if (!(+x.price > 0)) bad.push('price');
  if (bad.length) {
    bad.forEach((k) => $(`[data-k="${k}"]`)?.setAttribute('aria-invalid', 'true'));
    $(`[data-k="${bad[0]}"]`).focus();
    toast(L('Заполните название и цену', 'Fill in the name and price'));
    return;
  }
  if (+x.old && +x.old <= +x.price) { x.old = 0; }
  const clean = {
    ...x, name: [x.name[0].trim(), (x.name[1] || '').trim()], price: +x.price, old: +x.old || 0, cost: +x.cost || 0,
    min: +x.min || 0, lead: +x.lead || 14, dims: x.dims.map((n) => +n || 0), colors: x.colors.filter((c) => c[1] || c[2]),
    sku: x.sku.trim() || db.nextSku(x.cat), stock: +x.stock || 0,
  };
  try {
    const p = db.saveProduct(clean);
    d.close();
    toast(x.id ? L('Сохранено', 'Saved') : L(`Добавлено: ${T(p.name)}`, `Added: ${T(p.name)}`));
  } catch (err) { toast(err.message); }
}

function sheet(html, narrow) {
  $$('dialog.sheet').forEach((s) => s.remove());
  const d = document.createElement('dialog');
  d.className = 'sheet' + (narrow ? ' narrow' : '');
  d.innerHTML = html;
  document.body.append(d);
  d.showModal();
  d.addEventListener('click', (e) => { if (e.target === d || e.target.closest('[data-close]')) d.close(); });
  d.addEventListener('close', () => setTimeout(() => d.remove(), 50));
  return d;
}

// ═══════════ СКЛАД
const st = { type: 'all', q: '', limit: 60 };
let op = { type: 'in', pid: '', qty: '', cost: '', note: '' };

VIEWS.stock = (v) => {
  const prods = db.products();
  const sum = (f) => prods.reduce((s, p) => s + f(p), 0);
  const need = prods.filter((p) => p.stock <= p.min);
  v.innerHTML = `
    <div class="page-head"><h1>${L('Склад', 'Stock')}<small>${L('Приход, списание, инвентаризация и журнал всех движений', 'Receipts, write-offs, counts and the full movement log')}</small></h1>
      <button class="b" type="button" data-act="export-moves"><i class="ph ph-download-simple"></i><span>${L('Журнал CSV', 'Log CSV')}</span></button>
      <button class="b pri" type="button" data-receive=""><i class="ph ph-plus"></i><span>${L('Новая операция', 'New entry')}</span></button></div>
    <div class="tiles">
      <div class="tile"><span class="tile-label"><i class="ph ph-stack"></i>${L('Единиц на складе', 'Units in stock')}</span><span class="tile-value">${num(sum((p) => Math.max(p.stock, 0)))}</span><span class="tile-sub">${prods.length} ${L(plural(prods.length, 'позиция', 'позиции', 'позиций'), 'items')}</span></div>
      <div class="tile"><span class="tile-label"><i class="ph ph-coins"></i>${L('По себестоимости', 'At cost')}</span><span class="tile-value">${money(sum((p) => Math.max(p.stock, 0) * p.cost))}</span><span class="tile-sub">${L('во что вложены деньги', 'money tied up')}</span></div>
      <div class="tile"><span class="tile-label"><i class="ph ph-tag"></i>${L('В розничных ценах', 'At retail')}</span><span class="tile-value">${money(sum((p) => Math.max(p.stock, 0) * p.price))}</span><span class="tile-sub">${L('если продать всё', 'if everything sells')}</span></div>
      <div class="tile"><span class="tile-label"><i class="ph ph-warning"></i>${L('Пора заказать', 'Reorder now')}</span><span class="tile-value">${need.length}</span><span class="tile-sub">${L('на пороге или ниже', 'at or below threshold')}</span></div>
    </div>
    <div class="toolbar-a">
      <label class="search-in"><i class="ph ph-magnifying-glass"></i><input class="in" type="search" id="sq" value="${esc(st.q)}" placeholder="${L('Товар или комментарий', 'Product or note')}" aria-label="${L('Поиск', 'Search')}"></label>
      <select class="sel" id="stype" aria-label="${L('Тип операции', 'Entry type')}"><option value="all">${L('Все операции', 'All entries')}</option>${Object.entries(db.MOVE_NAME).map(([k, n]) => `<option value="${k}" ${st.type === k ? 'selected' : ''}>${T(n)}</option>`).join('')}</select>
    </div>
    <div id="mtable"></div>`;
  renderMoves();
  $('#sq', v).addEventListener('input', (e) => { st.q = e.target.value; st.limit = 60; renderMoves(); });
  $('#stype', v).addEventListener('change', (e) => { st.type = e.target.value; st.limit = 60; renderMoves(); });
};

const moveCls = { in: 'ok', out: 'bad', sale: 'acc', return: 'warn', adjust: '' };
function renderMoves() {
  const box = $('#mtable');
  if (!box) return;
  const q = st.q.trim().toLowerCase();
  const list = db.moves().filter((m) => {
    if (st.type !== 'all' && m.type !== st.type) return false;
    if (q) { const p = db.product(m.pid); if (![...(p?.name || []), p?.sku, m.note].join(' ').toLowerCase().includes(q)) return false; }
    return true;
  });
  box.innerHTML = list.length ? `<div class="tbl-wrap"><table class="tbl tbl-cards"><thead><tr><th>${L('Дата', 'Date')}</th><th>${L('Товар', 'Product')}</th><th>${L('Операция', 'Type')}</th><th class="n">${L('Кол-во', 'Qty')}</th><th class="n hide-md">${L('Сумма (себест.)', 'Value (cost)')}</th><th class="hide-md">${L('Комментарий', 'Note')}</th></tr></thead><tbody>
    ${list.slice(0, st.limit).map((m) => {
      const p = db.product(m.pid);
      return `<tr><td class="muted m-meta m-r2c23 tnum" style="white-space:nowrap">${fTime(m.ts)}</td>
        <td class="m-r1c12"><div class="prod-cell"><img src="${pimg(p)}" alt="" loading="lazy"><div><b>${esc(p ? T(p.name) : L('Удалённый товар', 'Deleted product'))}</b><small>${esc(p?.sku || '')}</small></div></div></td>
        <td class="m-r2c1"><span class="pill ${moveCls[m.type]}">${T(db.MOVE_NAME[m.type])}</span></td>
        <td class="n m-r1c3"><span class="${m.qty > 0 ? 'qty-plus' : 'qty-minus'}">${m.qty > 0 ? '+' : '−'}${Math.abs(m.qty)}</span></td>
        <td class="n hide-md m-hide">${money(Math.abs(m.qty) * (m.cost || 0))}</td>
        <td class="hide-md m-meta muted">${esc(m.note)}</td></tr>`;
    }).join('')}</tbody></table>
    ${list.length > st.limit ? `<div class="more"><button class="b" type="button" data-act="more-moves">${L('Показать ещё', 'Show more')} (${list.length - st.limit})</button></div>` : ''}</div>`
    : `<div class="panel"><p class="empty-note">${L('Операций не найдено', 'No entries found')}</p></div>`;
}

function openStockSheet(pid, type) {
  op = { type: type || 'in', pid: pid || op.pid || db.products()[0]?.id, qty: '', cost: '', note: '' };
  const d = sheet(`<div class="sh-head"><h2>${L('Складская операция', 'Stock entry')}<small>${L('Остаток изменится сразу и попадёт в журнал', 'Stock updates at once and goes to the log')}</small></h2><button class="b ghost icon" type="button" data-close aria-label="${L('Закрыть', 'Close')}"><i class="ph ph-x"></i></button></div>
    <form class="sh-body op" id="opform" novalidate></form>
    <div class="sh-foot"><span class="grow"></span><button class="b" type="button" data-close>${L('Отмена', 'Cancel')}</button><button class="b pri" type="submit" form="opform">${L('Провести', 'Post')}</button></div>`, true);
  renderOpForm();
  const f = $('#opform', d);
  f.addEventListener('input', (e) => { const k = e.target.dataset.op; if (!k) return; op[k] = e.target.value; e.target.removeAttribute('aria-invalid'); if (k === 'pid') renderOpForm(); else renderOpPreview(); });
  f.addEventListener('click', (e) => { const b = e.target.closest('[data-optype]'); if (b) { op.type = b.dataset.optype; renderOpForm(); } });
  f.addEventListener('submit', (e) => {
    e.preventDefault();
    const qty = Math.round(+op.qty);
    if (op.qty === '' || qty < 0 || (op.type !== 'adjust' && qty === 0)) { $('[data-op="qty"]', d).setAttribute('aria-invalid', 'true'); $('[data-op="qty"]', d).focus(); return; }
    try {
      const m = db.stockMove({ pid: op.pid, type: op.type, qty, note: op.note.trim(), cost: op.type === 'in' && op.cost !== '' ? +op.cost : null });
      d.close();
      toast(m ? L('Проведено', 'Posted') : L('Остаток не изменился', 'Stock unchanged'));
    } catch (err) { toast(err.message); }
  });
  setTimeout(() => $('[data-op="qty"]', d)?.focus(), 60);
}

function renderOpForm() {
  const f = $('#opform');
  const p = db.product(op.pid);
  const types = [['in', 'ph-arrow-down-left', L('Приход', 'Receipt')], ['out', 'ph-arrow-up-right', L('Списание', 'Write-off')], ['adjust', 'ph-clipboard-text', L('Инвентаризация', 'Stock count')]];
  f.innerHTML = `
    <div class="tg" role="group" aria-label="${L('Тип', 'Type')}" style="justify-self:start">${types.map(([k, ic, n]) => `<button type="button" data-optype="${k}" aria-pressed="${op.type === k}"><i class="ph ${ic}"></i> ${n}</button>`).join('')}</div>
    <label class="fld"><span>${L('Товар', 'Product')}</span><select class="sel" data-op="pid">${db.categories().map((c) => { const ps = db.products().filter((x) => x.cat === c.id); return ps.length ? `<optgroup label="${esc(T(c.name))}">${ps.map((x) => `<option value="${x.id}" ${x.id === op.pid ? 'selected' : ''}>${esc(T(x.name))} · ${esc(x.sku)} · ${x.stock}</option>`).join('')}</optgroup>` : ''; }).join('')}</select></label>
    <div class="row"><label class="fld"><span>${op.type === 'adjust' ? L('Фактически на складе', 'Actual count') : L('Количество, шт.', 'Quantity, pcs')}</span><input class="in" type="number" min="0" inputmode="numeric" data-op="qty" value="${op.qty}"></label>
      ${op.type === 'in' ? `<label class="fld"><span>${L('Цена закупки за шт.', 'Unit cost')}</span><input class="in" type="number" min="0" step="500" inputmode="numeric" data-op="cost" value="${op.cost}" placeholder="${p ? num(p.cost) : ''}"></label>` : '<span></span>'}</div>
    <label class="fld"><span>${L('Комментарий', 'Note')}</span><input class="in" data-op="note" value="${esc(op.note)}" placeholder="${op.type === 'in' ? L('Накладная №, поставщик', 'Invoice no., supplier') : op.type === 'out' ? L('Брак, образец для шоурума…', 'Damage, showroom sample…') : L('Плановая инвентаризация', 'Scheduled count')}"></label>
    <div class="op-preview" id="opPreview"></div>
    ${op.type === 'in' ? `<p class="muted" style="font-size:13px">${L('Если цена закупки отличается, себестоимость пересчитается как средневзвешенная.', 'If the unit cost differs, the cost price is recalculated as a weighted average.')}</p>` : ''}`;
  renderOpPreview();
}

function renderOpPreview() {
  const p = db.product(op.pid);
  const box = $('#opPreview');
  if (!p || !box) return;
  const q = Math.round(+op.qty || 0);
  const after = op.type === 'in' ? p.stock + q : op.type === 'out' ? p.stock - q : op.qty === '' ? p.stock : q;
  box.innerHTML = `<img src="${pimg(p)}" alt=""><div style="flex:1"><div>${esc(T(p.name))}</div><div class="muted">${L('Остаток', 'Stock')}</div></div><b>${p.stock}</b><i class="ph ph-arrow-right arrow"></i><b style="color:${after < 0 ? 'var(--bad)' : after !== p.stock ? 'var(--accent)' : 'inherit'}">${after}</b>`;
}

// ═══════════ ЗАКАЗЫ
const or = { status: 'all', q: '', limit: 60 };
const STATUS_TAB = { new: ['Новые', 'New'], confirmed: ['Подтверждены', 'Confirmed'], delivering: ['В доставке', 'Delivering'], done: ['Выполнены', 'Completed'], canceled: ['Отменены', 'Canceled'] };

VIEWS.orders = (v) => {
  const sub = location.hash.split('/')[2];
  if (sub && db.STATUSES.includes(sub)) { or.status = sub; history.replaceState(null, '', '#/orders'); }
  const all = db.orders();
  const cnt = (s) => all.filter((o) => o.status === s).length;
  v.innerHTML = `
    <div class="page-head"><h1>${L('Заказы', 'Orders')}<small>${L('Новые заказы с сайта появляются здесь сразу', 'New orders from the site appear here instantly')}</small></h1>
      <button class="b" type="button" data-act="export-orders"><i class="ph ph-download-simple"></i><span>CSV</span></button>
      <button class="b pri" type="button" data-act="new-order"><i class="ph ph-plus"></i><span>${L('Продажа в шоуруме', 'In-store sale')}</span></button></div>
    <div class="toolbar-a">
      <div class="tg" role="group" aria-label="${L('Статус', 'Status')}" style="overflow-x:auto;max-width:100%">${[['all', L('Все', 'All'), all.length], ...db.STATUSES.map((s) => [s, T(STATUS_TAB[s]), cnt(s)])].map(([k, n, c]) => `<button type="button" data-ostatus="${k}" aria-pressed="${or.status === k}">${n} <span class="muted">${c}</span></button>`).join('')}</div>
      <label class="search-in"><i class="ph ph-magnifying-glass"></i><input class="in" type="search" id="oq" value="${esc(or.q)}" placeholder="${L('№, имя или телефон', 'No., name or phone')}" aria-label="${L('Поиск', 'Search')}"></label>
    </div>
    <div id="otable"></div>`;
  renderOrders();
  $('#oq', v).addEventListener('input', (e) => { or.q = e.target.value; renderOrders(); });
};

function renderOrders() {
  const box = $('#otable');
  if (!box) return;
  const q = or.q.trim().toLowerCase().replace(/^№/, '');
  const qd = q.replace(/\D/g, '');
  const list = db.orders().filter((o) => {
    if (or.status !== 'all' && o.status !== or.status) return false;
    if (q && !(String(o.no).includes(q) || o.name.toLowerCase().includes(q) || (qd.length > 2 && o.phone.replace(/\D/g, '').includes(qd)))) return false;
    return true;
  });
  box.innerHTML = list.length ? `<div class="tbl-wrap"><table class="tbl tbl-cards"><thead><tr><th>№</th><th>${L('Дата', 'Date')}</th><th>${L('Клиент', 'Customer')}</th><th class="hide-md">${L('Состав', 'Items')}</th><th class="n">${L('Сумма', 'Total')}</th><th>${L('Статус', 'Status')}</th></tr></thead><tbody>
    ${list.slice(0, or.limit).map((o) => `<tr class="clickable" data-order="${o.id}">
      <td class="tnum"><b>${o.no}</b> ${o.source === 'store' ? `<i class="ph ph-storefront muted" title="${L('Шоурум', 'Showroom')}"></i>` : ''}</td>
      <td class="muted tnum" style="white-space:nowrap">${fTime(o.ts)}</td>
      <td class="m-r2c12"><b style="font-weight:500">${esc(o.name)}</b><br><span class="muted tnum">${esc(o.phone)}</span></td>
      <td class="hide-md m-meta muted">${esc(T(o.items[0].name))}${o.items[0].qty > 1 ? ' ×' + o.items[0].qty : ''}${o.items.length > 1 ? L(` и ещё ${o.items.length - 1}`, ` +${o.items.length - 1} more`) : ''}</td>
      <td class="n m-r2c3"><b style="font-weight:500">${money(o.total)}</b></td>
      <td class="m-r1c3"><span class="pill st-${o.status}">${statusName(o.status)}</span></td></tr>`).join('')}
    </tbody></table>${list.length > or.limit ? `<div class="more"><button class="b" type="button" data-act="more-orders">${L('Показать ещё', 'Show more')} (${list.length - or.limit})</button></div>` : ''}</div>`
    : `<div class="panel"><p class="empty-note">${L('Заказов нет', 'No orders')}</p></div>`;
}

const NEXT = { new: ['confirmed', L('Подтвердить', 'Confirm'), 'ph-check'], confirmed: ['delivering', L('Передать в доставку', 'Send for delivery'), 'ph-truck'], delivering: ['done', L('Выполнен', 'Mark completed'), 'ph-check-circle'] };

function openOrderSheet(id) {
  const o = db.orders().find((x) => x.id === id);
  if (!o) return;
  const step = { new: 1, confirmed: 2, delivering: 3, done: 4, canceled: 0 }[o.status];
  const profit = db.orderProfit(o);
  const nx = NEXT[o.status];
  const d = sheet(`<div class="sh-head"><h2>${L('Заказ', 'Order')} №${o.no}<small>${fTime(o.ts)} · ${o.source === 'store' ? L('шоурум', 'showroom') : L('сайт', 'website')}</small></h2><span class="pill st-${o.status}">${statusName(o.status)}</span><button class="b ghost icon" type="button" data-close aria-label="${L('Закрыть', 'Close')}"><i class="ph ph-x"></i></button></div>
    <div class="sh-body">
      <div class="o-steps ${o.status}">${[1, 2, 3, 4].map((i) => `<span class="${i <= step ? 'on' : ''}"></span>`).join('')}</div>
      <section class="sec"><h3>${L('Клиент', 'Customer')}</h3>
        <dl class="kv"><dt>${L('Имя', 'Name')}</dt><dd>${esc(o.name)}</dd><dt>${L('Телефон', 'Phone')}</dt><dd>${o.phone ? `<a href="tel:${esc(o.phone.replace(/\s/g, ''))}">${esc(o.phone)}</a> · <a href="https://wa.me/${o.phone.replace(/\D/g, '')}" target="_blank" rel="noopener">WhatsApp</a>` : '—'}</dd>
        <dt>${L('Получение', 'Delivery')}</dt><dd>${o.delivery === 'pickup' ? L('Самовывоз, Абая 150', 'Pickup, 150 Abay Ave') : L('Доставка: ', 'Delivery: ') + esc(o.address)}</dd>
        ${o.comment ? `<dt>${L('Комментарий', 'Comment')}</dt><dd>${esc(o.comment)}</dd>` : ''}</dl></section>
      <section class="sec"><h3>${L('Состав', 'Items')}</h3><div class="o-lines">${o.items.map((it) => { const p = db.product(it.pid); return `<div class="o-line"><img src="${pimg(p)}" alt=""><div>${esc(T(it.name))}<small>${it.color ? esc(it.color) + ' · ' : ''}${it.qty} × ${money(it.price)}${p && p.stock < 0 ? ' · <span style="color:var(--bad)">' + L('нет на складе', 'not in stock') + '</span>' : ''}</small></div><b class="tnum">${money(it.qty * it.price)}</b></div>`; }).join('')}</div>
        <dl class="kv" style="border-top:1px solid var(--line);padding-top:10px">${o.fee ? `<dt>${L('Доставка', 'Delivery')}</dt><dd class="n">${money(o.fee)}</dd>` : ''}<dt><b>${L('Итого', 'Total')}</b></dt><dd class="n"><b>${money(o.total)}</b></dd><dt>${L('Валовая прибыль', 'Gross profit')}</dt><dd class="n">${money(profit)}</dd></dl></section>
      ${o.log?.length ? `<section class="sec"><h3>${L('История', 'History')}</h3><ul class="log">${o.log.map(([ts, s]) => `<li><span>${fTime(ts)}</span>${statusName(s)}</li>`).join('')}</ul></section>` : ''}
    </div>
    <div class="sh-foot">${o.status !== 'canceled' && o.status !== 'done' ? `<button class="b danger" type="button" data-ost="canceled">${L('Отменить', 'Cancel order')}</button>` : ''}${o.status === 'canceled' ? `<button class="b" type="button" data-ost="new">${L('Восстановить', 'Restore')}</button>` : ''}<span class="grow"></span>
      ${nx ? `<button class="b pri" type="button" data-ost="${nx[0]}"><i class="ph ${nx[2]}"></i>${nx[1]}</button>` : `<button class="b" type="button" data-close>${L('Закрыть', 'Close')}</button>`}</div>`, true);
  d.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-ost]');
    if (!b) return;
    const s = b.dataset.ost;
    if (s === 'canceled' && !(await confirmBox({ title: L(`Отменить заказ №${o.no}?`, `Cancel order #${o.no}?`), text: L('Товары вернутся на склад.', 'Items go back to stock.'), ok: L('Отменить заказ', 'Cancel order') }))) return;
    db.setOrderStatus(o.id, s);
    toast(L(`№${o.no}: ${statusName(s).toLowerCase()}`, `#${o.no}: ${statusName(s).toLowerCase()}`));
    openOrderSheet(o.id);
  });
}

// Продажа в шоуруме: менеджер собирает заказ вручную
let mo = null;
function openManualOrder() {
  mo = { name: '', phone: '', delivery: 'pickup', address: '', comment: '', items: [], pick: db.products().find((p) => p.stock > 0)?.id, qty: 1 };
  const d = sheet(`<div class="sh-head"><h2>${L('Продажа в шоуруме', 'In-store sale')}<small>${L('Товары спишутся со склада сразу', 'Items are deducted from stock at once')}</small></h2><button class="b ghost icon" type="button" data-close aria-label="${L('Закрыть', 'Close')}"><i class="ph ph-x"></i></button></div>
    <form class="sh-body" id="moform" novalidate></form>
    <div class="sh-foot"><span class="grow" id="moTotal"></span><button class="b" type="button" data-close>${L('Отмена', 'Cancel')}</button><button class="b pri" type="submit" form="moform">${L('Создать заказ', 'Create order')}</button></div>`, true);
  renderMO();
  const f = $('#moform', d);
  f.addEventListener('input', (e) => { const k = e.target.dataset.mo; if (!k) return; mo[k] = e.target.type === 'number' ? +e.target.value : e.target.value; e.target.removeAttribute('aria-invalid'); if (k === 'delivery') renderMO(); });
  f.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.moAdd != null) {
      const p = db.product(mo.pick);
      if (!p) return;
      const ex = mo.items.find((i) => i.pid === p.id);
      if (ex) ex.qty += Math.max(1, mo.qty); else mo.items.push({ pid: p.id, qty: Math.max(1, mo.qty) });
      renderMO();
    } else if (b.dataset.moDel) { mo.items.splice(+b.dataset.moDel, 1); renderMO(); }
  });
  f.addEventListener('submit', (e) => {
    e.preventDefault();
    if (!mo.items.length) { toast(L('Добавьте хотя бы один товар', 'Add at least one item')); return; }
    if (!mo.name.trim()) { $('[data-mo="name"]', d).setAttribute('aria-invalid', 'true'); $('[data-mo="name"]', d).focus(); return; }
    const o = db.createOrder({ ...mo, name: mo.name.trim(), source: 'store' });
    db.setOrderStatus(o.id, 'confirmed');
    d.close();
    toast(L(`Заказ №${o.no} создан`, `Order #${o.no} created`), L('Открыть', 'Open'), () => openOrderSheet(o.id));
  });
}

function renderMO() {
  const f = $('#moform');
  const sub = mo.items.reduce((s, i) => s + db.product(i.pid).price * i.qty, 0);
  const sset = db.settings();
  const fee = mo.delivery === 'delivery' && sub < sset.freeDelivery ? sset.deliveryFee : 0;
  f.innerHTML = `
    <section class="sec"><h3>${L('Товары', 'Items')}</h3>
      <div class="add-line"><select class="sel" data-mo="pick" aria-label="${L('Товар', 'Product')}">${db.products().map((p) => `<option value="${p.id}" ${p.id === mo.pick ? 'selected' : ''}>${esc(T(p.name))} · ${money(p.price)} · ${L('ост.', 'stock')} ${p.stock}</option>`).join('')}</select>
        <input class="in" type="number" min="1" value="${mo.qty}" data-mo="qty" aria-label="${L('Количество', 'Quantity')}"><button class="b" type="button" data-mo-add><i class="ph ph-plus"></i></button></div>
      <div class="o-lines">${mo.items.map((it, i) => { const p = db.product(it.pid); return `<div class="o-line"><img src="${pimg(p)}" alt=""><div>${esc(T(p.name))}<small>${it.qty} × ${money(p.price)}${it.qty > p.stock ? ' · <span style="color:var(--warn)">' + L('под заказ', 'to order') + '</span>' : ''}</small></div><button class="b ghost icon" type="button" data-mo-del="${i}" aria-label="${L('Убрать', 'Remove')}"><i class="ph ph-x"></i></button></div>`; }).join('') || `<p class="muted">${L('Пока пусто', 'Empty so far')}</p>`}</div>
    </section>
    <section class="sec"><h3>${L('Клиент', 'Customer')}</h3>
      <div class="row"><label class="fld"><span>${L('Имя', 'Name')} <em>*</em></span><input class="in" data-mo="name" value="${esc(mo.name)}"></label><label class="fld"><span>${L('Телефон', 'Phone')}</span><input class="in" type="tel" data-mo="phone" value="${esc(mo.phone)}" placeholder="+7"></label></div>
      <label class="fld"><span>${L('Получение', 'Delivery')}</span><select class="sel" data-mo="delivery"><option value="pickup" ${mo.delivery === 'pickup' ? 'selected' : ''}>${L('Забирает сам', 'Takes it now')}</option><option value="delivery" ${mo.delivery === 'delivery' ? 'selected' : ''}>${L('Доставка', 'Delivery')}</option></select></label>
      ${mo.delivery === 'delivery' ? `<label class="fld"><span>${L('Адрес', 'Address')}</span><input class="in" data-mo="address" value="${esc(mo.address)}"></label>` : ''}
      <label class="fld"><span>${L('Комментарий', 'Comment')}</span><input class="in" data-mo="comment" value="${esc(mo.comment)}"></label>
    </section>`;
  $('#moTotal').innerHTML = mo.items.length ? `<b>${money(sub + fee)}</b>${fee ? ` <span class="muted">${L('вкл. доставку', 'incl. delivery')}</span>` : ''}` : '';
}

// ═══════════ КАТЕГОРИИ
VIEWS.categories = (v) => {
  const cats = db.categories();
  v.innerHTML = `<div class="page-head"><h1>${L('Категории', 'Categories')}<small>${L('Порядок здесь = порядок на сайте', 'Order here = order on the site')}</small></h1></div>
    <div class="cat-list">${cats.map((c, i) => {
      const n = db.products().filter((p) => p.cat === c.id).length;
      return `<div class="cat-row" data-cid="${c.id}"><span class="idx">${String(i + 1).padStart(2, '0')}</span>
        <input class="in" data-cname="0" value="${esc(c.name[0])}" aria-label="${L('Название RU', 'Name RU')}"><input class="in" data-cname="1" value="${esc(c.name[1])}" aria-label="${L('Название EN', 'Name EN')}">
        <a class="muted" href="#/products" data-catlink="${c.id}">${n} ${L(plural(n, 'товар', 'товара', 'товаров'), n === 1 ? 'item' : 'items')}</a>
        <div class="acts"><button class="b ghost icon" type="button" data-cmove="-1" ${i ? '' : 'disabled'} aria-label="${L('Выше', 'Up')}"><i class="ph ph-arrow-up"></i></button><button class="b ghost icon" type="button" data-cmove="1" ${i < cats.length - 1 ? '' : 'disabled'} aria-label="${L('Ниже', 'Down')}"><i class="ph ph-arrow-down"></i></button><button class="b ghost icon danger" type="button" data-cdel aria-label="${L('Удалить', 'Delete')}"><i class="ph ph-trash"></i></button></div></div>`;
    }).join('')}
    <form class="cat-row" id="catAdd"><span class="idx">+</span><input class="in" name="ru" placeholder="${L('Новая категория RU', 'New category RU')}" required><input class="in" name="en" placeholder="${L('EN (необязательно)', 'EN (optional)')}"><span></span><button class="b pri" type="submit"><i class="ph ph-plus"></i>${L('Добавить', 'Add')}</button></form></div>`;
  $$('[data-cname]', v).forEach((inp) => inp.addEventListener('change', () => {
    const c = db.category(inp.closest('[data-cid]').dataset.cid);
    const name = [...c.name]; name[+inp.dataset.cname] = inp.value.trim();
    if (!name[0]) { inp.value = c.name[0]; return; }
    db.saveCategory({ id: c.id, name }); toast(L('Сохранено', 'Saved'));
  }));
  $('#catAdd', v).addEventListener('submit', (e) => {
    e.preventDefault();
    const ru = e.target.ru.value.trim();
    if (!ru) return;
    db.saveCategory({ name: [ru, e.target.en.value.trim() || ru] });
    toast(L('Категория добавлена', 'Category added'));
  });
};

async function deleteCategory(id) {
  const c = db.category(id);
  const n = db.products().filter((p) => p.cat === id).length;
  const others = db.categories().filter((x) => x.id !== id);
  if (!others.length) { toast(L('Нельзя удалить последнюю категорию', 'Cannot delete the last category')); return; }
  const res = await confirmBox({
    title: L(`Удалить «${T(c.name)}»?`, `Delete “${T(c.name)}”?`),
    text: n ? L(`В категории ${n} ${plural(n, 'товар', 'товара', 'товаров')}. Куда их перенести?`, `It has ${n} product(s). Move them to:`) : '',
    extra: n ? `<select class="sel" id="moveTo">${others.map((x) => `<option value="${x.id}">${esc(T(x.name))}</option>`).join('')}</select>` : '',
  });
  if (!res) return;
  db.removeCategory(id, n ? $('#moveTo', res).value : others[0].id);
  toast(L('Категория удалена', 'Category deleted'));
}

// ═══════════ НАСТРОЙКИ
VIEWS.settings = (v) => {
  const s = db.settings();
  v.innerHTML = `<div class="page-head"><h1>${L('Настройки', 'Settings')}</h1></div>
    <div class="settings">
      <form class="sec" id="setDelivery"><h3>${L('Доставка', 'Delivery')}</h3>
        <div class="row"><label class="fld"><span>${L('Бесплатно от, ₸', 'Free from, ₸')}</span><input class="in" type="number" min="0" step="10000" name="freeDelivery" value="${s.freeDelivery}"></label><label class="fld"><span>${L('Иначе стоимость, ₸', 'Otherwise, ₸')}</span><input class="in" type="number" min="0" step="500" name="deliveryFee" value="${s.deliveryFee}"></label></div>
        <div class="acts"><button class="b pri" type="submit">${L('Сохранить', 'Save')}</button></div></form>
      <form class="sec" id="setPin"><h3>${L('PIN-код входа', 'Login PIN')}</h3>
        <div class="row"><label class="fld"><span>${L('Новый PIN (4 цифры)', 'New PIN (4 digits)')}</span><input class="in" name="pin" inputmode="numeric" maxlength="4" pattern="\\d{4}" autocomplete="off"></label><span></span></div>
        <div class="acts"><button class="b" type="submit">${L('Сменить PIN', 'Change PIN')}</button></div></form>
      <section class="sec"><h3>${L('Резервная копия и выгрузки', 'Backup & exports')}</h3>
        <p>${L('Все данные (товары, фото, заказы, склад) хранятся в этом браузере. Скачивайте копию после важных изменений — её можно загрузить на другом компьютере.', 'All data (products, photos, orders, stock) lives in this browser. Download a backup after important changes; you can load it on another computer.')}</p>
        <div class="acts"><button class="b ink" type="button" data-act="backup"><i class="ph ph-download-simple"></i>${L('Скачать копию (JSON)', 'Download backup (JSON)')}</button>
          <label class="b"><i class="ph ph-upload-simple"></i>${L('Загрузить копию', 'Restore backup')}<input type="file" accept="application/json,.json" id="restore" hidden></label>
          <button class="b" type="button" data-act="export-products"><i class="ph ph-table"></i>${L('Товары CSV', 'Products CSV')}</button>
          <button class="b" type="button" data-act="export-orders"><i class="ph ph-table"></i>${L('Заказы CSV', 'Orders CSV')}</button></div></section>
      <section class="sec"><h3>${L('Демо-данные', 'Demo data')}</h3>
        <p>${L('Вернуть стартовый каталог из 36 товаров и историю продаж за 30 дней. Все ваши изменения пропадут.', 'Restore the original 36-item catalogue and 30 days of sales history. All your changes will be lost.')}</p>
        <div class="acts"><button class="b danger" type="button" data-act="reset"><i class="ph ph-arrow-counter-clockwise"></i>${L('Сбросить к демо', 'Reset to demo')}</button></div></section>
      <section class="sec"><h3>${L('Как это устроено', 'How it works')}</h3>
        <p>${L('Это демо-версия без сервера: сайт и панель читают одну базу в localStorage, поэтому заказ, оформленный на сайте, появляется здесь мгновенно — но только в этом браузере. Для работы нескольких менеджеров с разных устройств базу нужно перенести на сервер (например, Supabase или Firebase); интерфейс при этом не меняется.', 'This demo has no server: the site and the panel share one localStorage database, so an order placed on the site shows up here instantly, but only in this browser. For several managers on different devices, move the database to a server (e.g. Supabase or Firebase); the interface stays the same.')}</p></section>
    </div>`;
  $('#setDelivery', v).addEventListener('submit', (e) => { e.preventDefault(); db.setSettings({ freeDelivery: +e.target.freeDelivery.value || 0, deliveryFee: +e.target.deliveryFee.value || 0 }); toast(L('Сохранено', 'Saved')); });
  $('#setPin', v).addEventListener('submit', (e) => {
    e.preventDefault();
    const pin = e.target.pin.value;
    if (!/^\d{4}$/.test(pin)) { e.target.pin.setAttribute('aria-invalid', 'true'); toast(L('PIN — ровно 4 цифры', 'PIN must be exactly 4 digits')); return; }
    db.setSettings({ pin }); e.target.reset(); toast(L('PIN изменён', 'PIN changed'));
  });
  $('#restore', v).addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (!(await confirmBox({ title: L('Заменить все данные копией?', 'Replace all data with the backup?'), text: file.name, ok: L('Заменить', 'Replace') }))) return;
    try { db.importJSON(await file.text()); toast(L('Данные восстановлены', 'Data restored')); } catch (err) { toast(err.message || L('Файл не подошёл', 'Invalid file')); }
  });
};

// ——— Выгрузки
function exportProducts() {
  const rows = [[L('Артикул', 'SKU'), L('Название', 'Name'), L('Категория', 'Category'), L('Цена', 'Price'), L('Старая цена', 'Was'), L('Себестоимость', 'Cost'), L('Остаток', 'Stock'), L('Порог', 'Threshold'), L('На сайте', 'Live'), L('Ш×Г×В', 'W×D×H'), L('Материалы', 'Materials')]];
  db.products().forEach((p) => rows.push([p.sku, T(p.name), catName(p.cat), p.price, p.old || '', p.cost, p.stock, p.min, p.visible ? 1 : 0, p.dims.join('×'), T(p.mat)]));
  download(`tor-products-${stamp()}.csv`, csv(rows), 'text/csv');
}
function exportOrders() {
  const rows = [['№', L('Дата', 'Date'), L('Статус', 'Status'), L('Клиент', 'Customer'), L('Телефон', 'Phone'), L('Получение', 'Delivery'), L('Адрес', 'Address'), L('Состав', 'Items'), L('Сумма', 'Total'), L('Прибыль', 'Profit'), L('Источник', 'Source')]];
  db.orders().forEach((o) => rows.push([o.no, new Date(o.ts).toLocaleString(EN ? 'en-GB' : 'ru-RU'), statusName(o.status), o.name, o.phone, o.delivery, o.address, o.items.map((i) => `${T(i.name)} ×${i.qty}`).join(', '), o.total, db.orderProfit(o), o.source]));
  download(`tor-orders-${stamp()}.csv`, csv(rows), 'text/csv');
}
function exportMoves() {
  const rows = [[L('Дата', 'Date'), L('Артикул', 'SKU'), L('Товар', 'Product'), L('Операция', 'Type'), L('Кол-во', 'Qty'), L('Себестоимость', 'Unit cost'), L('Комментарий', 'Note')]];
  db.moves().forEach((m) => { const p = db.product(m.pid); rows.push([new Date(m.ts).toLocaleString(EN ? 'en-GB' : 'ru-RU'), p?.sku || '', p ? T(p.name) : m.pid, T(db.MOVE_NAME[m.type]), m.qty, m.cost || '', m.note]); });
  download(`tor-stock-${stamp()}.csv`, csv(rows), 'text/csv');
}

// ——— Делегированные клики
app.addEventListener('click', async (e) => {
  const t = e.target.closest('button, a, tr, input');
  if (!t) return;
  const a = t.dataset.act;
  if (a === 'logout') { try { sessionStorage.removeItem(AUTH); } catch (err) {} render(); return; }
  if (a === 'new-product') return openProductSheet(null);
  if (a === 'export-products') return exportProducts();
  if (a === 'export-orders') return exportOrders();
  if (a === 'export-moves') return exportMoves();
  if (a === 'new-order') return openManualOrder();
  if (a === 'more-moves') { st.limit += 100; return renderMoves(); }
  if (a === 'more-orders') { or.limit += 100; return renderOrders(); }
  if (a === 'backup') return download(`tor-backup-${stamp()}.json`, db.exportJSON(), 'application/json');
  if (a === 'reset') { if (await confirmBox({ title: L('Сбросить все данные?', 'Reset all data?'), text: L('Каталог, заказы и склад вернутся к демо-версии.', 'Catalogue, orders and stock go back to the demo.'), ok: L('Сбросить', 'Reset') })) { db.reset(); toast(L('Демо-данные восстановлены', 'Demo data restored')); } return; }
  if (t.dataset.period) { dash.period = +t.dataset.period; return renderView(); }
  if (t.dataset.receive != null) { e.stopPropagation(); return openStockSheet(t.dataset.receive || null, 'in'); }
  if (t.dataset.dup) {
    const p = db.product(t.dataset.dup);
    const copy = structuredClone(p);
    delete copy.id; copy.name = [p.name[0] + L(' (копия)', ' (copy)'), p.name[1] + ' (copy)']; copy.sku = db.nextSku(p.cat); copy.stock = 0; copy.visible = false;
    return openProductSheet(null, copy);
  }
  if (t.dataset.del) return deleteProducts([t.dataset.del]);
  if (t.dataset.sort) { pr.dir = pr.sort === t.dataset.sort ? -pr.dir : 1; pr.sort = t.dataset.sort; return renderProductTable(); }
  if (t.dataset.vis) { db.setVisible([t.dataset.vis], t.checked); toast(t.checked ? L('Показан на сайте', 'Now live') : L('Скрыт с сайта', 'Hidden from the site')); return; }
  if (t.dataset.sel) { t.checked ? pr.sel.add(t.dataset.sel) : pr.sel.delete(t.dataset.sel); return renderProductTable(); }
  if (t.dataset.selall != null) { const rows = productRows(); t.checked ? rows.forEach((p) => pr.sel.add(p.id)) : pr.sel.clear(); return renderProductTable(); }
  if (t.dataset.bulk) {
    const ids = [...pr.sel];
    if (t.dataset.bulk === 'clear') { pr.sel.clear(); return renderProductTable(); }
    if (t.dataset.bulk === 'del') return deleteProducts(ids);
    db.setVisible(ids, t.dataset.bulk === 'show'); pr.sel.clear();
    return toast(t.dataset.bulk === 'show' ? L('Показаны на сайте', 'Now live') : L('Скрыты с сайта', 'Hidden from the site'));
  }
  if (t.dataset.ostatus) { or.status = t.dataset.ostatus; or.limit = 60; return VIEWS.orders($('#view')); }
  if (t.dataset.catlink) { pr.cat = t.dataset.catlink; pr.filter = 'all'; return; }
  if (t.dataset.cmove) { db.moveCategory(t.closest('[data-cid]').dataset.cid, +t.dataset.cmove); return; }
  if (t.dataset.cdel != null) return deleteCategory(t.closest('[data-cid]').dataset.cid);
  if (t.tagName === 'INPUT' || t.closest('label.switch')) return;
  const row = e.target.closest('tr[data-edit], tr[data-order]');
  if (row && !e.target.closest('button, input, label, a')) {
    if (row.dataset.edit) openProductSheet(row.dataset.edit);
    else openOrderSheet(row.dataset.order);
  }
});

// Кнопки «Приход» внутри редактора товара (диалог вне #app)
document.addEventListener('click', (e) => {
  const b = e.target.closest('dialog [data-receive]');
  if (b) { b.closest('dialog').close(); openStockSheet(b.dataset.receive, 'in'); }
});

addEventListener('hashchange', () => { if (authed()) renderView(); });
db.onChange((what) => {
  if (!authed() || !$('#view')) return;
  if (what === 'reset' || what === 'import') { pr.sel.clear(); }
  renderView();
});

render();
