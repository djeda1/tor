// ТӨР — витрина: комната с точками, указатель категорий, каталог, карточка товара, корзина.
import * as db from './db.js';
import { ROOM, PHOTO_CREDITS } from './data.js';

const { L, T, EN, money, esc, asset, thumb } = db;
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const visible = () => db.products().filter((p) => p.visible && !p.archived);
const catName = (id) => T(db.category(id)?.name) || '—';

// ——— Корзина
let ready = false; // данные загружены
const CART_KEY = 'tor:cart:v1';
let cart = [];
try { cart = JSON.parse(localStorage.getItem(CART_KEY)) || []; } catch (e) { cart = []; }
const saveCart = () => { try { localStorage.setItem(CART_KEY, JSON.stringify(cart)); } catch (e) {} renderCartCount(); };
const maxQty = (p) => (p.stock > 0 ? p.stock : 10);

function addToCart(pid, color, qty = 1, silent) {
  const p = db.product(pid);
  if (!p) return false;
  color = color || p.colors[0]?.[0] || '';
  const line = cart.find((l) => l.pid === pid && l.color === color);
  const have = line ? line.qty : 0;
  const can = Math.min(qty, maxQty(p) - have);
  if (can <= 0) { toast(L('Больше нет на складе', 'No more in stock')); return false; }
  if (line) line.qty += can; else cart.push({ pid, color, qty: can });
  db.track('cart', pid);
  saveCart();
  const b = $('.cart-btn'); b.classList.remove('bump'); void b.offsetWidth; b.classList.add('bump');
  if (!silent) toast(L('Добавлено: ', 'Added: ') + T(p.name), L('Корзина', 'View bag'), openCart);
  return true;
}

function cartLines() {
  // убираем товары, которые удалили или скрыли в админке
  if (!ready) return [];
  cart = cart.filter((l) => { const p = db.product(l.pid); return p && p.visible && !p.archived; });
  return cart.map((l) => ({ ...l, p: db.product(l.pid) }));
}
const cartSum = () => cartLines().reduce((s, l) => s + l.p.price * l.qty, 0);

function renderCartCount() {
  const n = cartLines().reduce((s, l) => s + l.qty, 0);
  const c = $('#cartCount');
  c.textContent = n; c.hidden = !n;
  $('.cart-btn').setAttribute('aria-label', L('Корзина', 'Bag') + (n ? `, ${n}` : ''));
}

// ——— Тост
let toastTimer;
function toast(msg, action, fn) {
  const t = $('#toast');
  t.innerHTML = `<span>${esc(msg)}</span>` + (action ? `<button type="button">${esc(action)}</button>` : '');
  t.hidden = false;
  t.style.animation = 'none'; void t.offsetWidth; t.style.animation = '';
  if (action) t.querySelector('button').onclick = () => { t.hidden = true; fn(); };
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (t.hidden = true), 3600);
}

// ——— Наличие
function avail(p) {
  if (p.stock <= 0) return { cls: 'out', text: L(`Под заказ · ${p.lead} дн.`, `Made to order · ${p.lead} days`) };
  if (p.stock <= p.min) return { cls: 'low', text: L(`Осталось ${p.stock} шт.`, `Only ${p.stock} left`) };
  return { cls: '', text: L('В наличии', 'In stock') };
}
const dimsText = (d) => (d?.length ? d.filter(Boolean).join(' × ') + L(' см', ' cm') : '');

// ——— Комната
const roomItems = () => ROOM.spots.map(([id, x, y]) => ({ p: db.product(id), x, y })).filter((s) => s.p && s.p.visible);

function renderRoom() {
  const stage = $('#roomStage');
  $$('.spot', stage).forEach((s) => s.remove());
  roomItems().forEach(({ p, x, y }, i) => {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'spot'; b.dataset.pid = p.id;
    b.style.left = x + '%'; b.style.top = y + '%'; b.style.setProperty('--d', i * 0.35 + 's');
    b.setAttribute('aria-expanded', 'false');
    b.setAttribute('aria-label', `${T(p.name)}, ${money(p.price)}`);
    b.innerHTML = `<i class="ph ph-plus" aria-hidden="true"></i><span class="spot-tag" aria-hidden="true">${esc(T(p.name))} · ${money(p.price)}</span>`;
    stage.append(b);
  });
  const items = roomItems();
  const total = items.reduce((s, { p }) => s + p.price, 0);
  const full = items.reduce((s, { p }) => s + (p.old || p.price), 0);
  $('#roomBar').innerHTML = items.length ? `
    <div class="rb-thumbs">${items.map(({ p }) => `<button type="button" data-open="${p.id}" aria-label="${esc(T(p.name))}"><img src="${thumb(p.imgs[0])}" alt="" loading="lazy"></button>`).join('')}</div>
    <p class="rb-name"><b>${esc(T(ROOM.name))}</b><br>${L(`${items.length} предметов на фото`, `${items.length} pieces in the photo`)}</p>
    <p class="rb-total">${full > total ? `<s>${money(full)}</s>` : ''}<b>${money(total)}</b></p>
    <button class="btn btn-primary" type="button" data-act="room-all"><i class="ph ph-bag-simple" aria-hidden="true"></i>${L('Взять комнату целиком', 'Take the whole room')}</button>` : '';
}

function openPop(btn) {
  const pop = $('#roomPop');
  const p = db.product(btn.dataset.pid);
  $$('.spot[aria-expanded="true"]').forEach((s) => s.setAttribute('aria-expanded', 'false'));
  btn.setAttribute('aria-expanded', 'true');
  const a = avail(p);
  pop.innerHTML = `
    <img src="${thumb(p.imgs[0])}" alt="">
    <div><p class="rp-name">${esc(T(p.name))}</p><p class="rp-meta">${esc(dimsText(p.dims))}</p><p class="rp-meta">${esc(a.text)}</p><p class="rp-price">${money(p.price)}</p></div>
    <div class="rp-actions">
      <button class="btn btn-ghost" type="button" data-open="${p.id}">${L('Подробнее', 'Details')}</button>
      <button class="btn btn-primary" type="button" data-add="${p.id}">${L('В корзину', 'Add to bag')}</button>
    </div>`;
  pop.hidden = false;
  const room = $('#room').getBoundingClientRect();
  const r = btn.getBoundingClientRect();
  const w = 300;
  let left = r.left - room.left + r.width / 2 - w / 2;
  left = Math.max(12, Math.min(left, room.width - w - 12));
  let top = r.bottom - room.top + 6;
  if (top + 190 > room.height) top = r.top - room.top - 196;
  pop.style.left = left + 'px'; pop.style.top = top + 'px';
}
function closePop() {
  $('#roomPop').hidden = true;
  $$('.spot[aria-expanded="true"]').forEach((s) => s.setAttribute('aria-expanded', 'false'));
}

// ——— Указатель категорий
function renderIndex() {
  const vis = visible();
  $('#indexList').innerHTML = db.categories().map((c, i) => {
    const items = vis.filter((p) => p.cat === c.id);
    if (!items.length) return '';
    const img = items[0].imgs[0];
    return `<li><button type="button" data-cat="${c.id}" data-peek="${thumb(img)}">
      <span class="ix-num">${String(i + 1).padStart(2, '0')}</span>
      <span class="ix-name">${esc(T(c.name))}</span>
      <span class="ix-faces" aria-hidden="true">${items.slice(1, 4).map((p) => `<img src="${thumb(p.imgs[0])}" alt="" loading="lazy">`).join('')}</span>
      <span class="ix-count">${items.length}</span>
      <i class="ph ph-arrow-right ix-arrow" aria-hidden="true"></i>
      <span class="ix-thumb"><img src="${thumb(img)}" alt="" loading="lazy"></span>
    </button></li>`;
  }).join('');
  $('.index .sec-note').textContent = L(`${vis.length} предметов · от вазы до углового дивана`, `${vis.length} pieces · from a vase to a corner sofa`);
}

function initPeek() {
  const peek = $('#indexPeek');
  const img = peek.querySelector('img');
  let x = 0, y = 0, raf;
  $('#indexList').addEventListener('pointermove', (e) => {
    if (e.pointerType !== 'mouse') return;
    const b = e.target.closest('button[data-peek]');
    if (!b) { peek.classList.remove('on'); return; }
    if (img.getAttribute('src') !== b.dataset.peek) img.src = b.dataset.peek;
    x = e.clientX + 150; y = e.clientY;
    peek.classList.add('on');
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(() => { peek.style.left = x + 'px'; peek.style.top = y + 'px'; });
  });
  $('#indexList').addEventListener('pointerleave', () => peek.classList.remove('on'));
}

// ——— Каталог
const F = { cat: 'all', q: '', sort: 'pop', min: '', max: '', width: 320, stock: false, sale: false };


function filtered() {
  const q = F.q.trim().toLowerCase();
  let list = visible().filter((p) => {
    if (F.cat !== 'all' && p.cat !== F.cat) return false;
    if (F.min && p.price < +F.min) return false;
    if (F.max && p.price > +F.max) return false;
    if (F.width < 320 && (p.dims?.[0] || 0) > F.width) return false;
    if (F.stock && p.stock <= 0) return false;
    if (F.sale && !(p.old > p.price)) return false;
    if (q) {
      const hay = [...p.name, ...p.mat, p.sku, ...(db.category(p.cat)?.name || []), ...p.colors.flatMap((c) => [c[1], c[2]])].join(' ').toLowerCase();
      if (!q.split(/\s+/).every((w) => hay.includes(w))) return false;
    }
    return true;
  });
  const cmp = {
    pop: (a, b) => (a.pop || 999) - (b.pop || 999),
    new: (a, b) => (b.tags.includes('new') - a.tags.includes('new')) || b.created - a.created,
    cheap: (a, b) => a.price - b.price,
    dear: (a, b) => b.price - a.price,
  }[F.sort];
  return list.sort(cmp);
}

function renderChips() {
  const vis = visible();
  const cats = db.categories().filter((c) => vis.some((p) => p.cat === c.id));
  if (F.cat !== 'all' && !cats.some((c) => c.id === F.cat)) F.cat = 'all';
  $('#chips').innerHTML = [{ id: 'all', name: [L('Всё', 'All'), 'All'], n: vis.length }, ...cats.map((c) => ({ ...c, n: vis.filter((p) => p.cat === c.id).length }))]
    .map((c) => `<button class="chip" type="button" role="tab" data-chip="${c.id}" aria-selected="${F.cat === c.id}">${esc(T(c.name))}<sup>${c.n}</sup></button>`).join('');
}

function badge(p) {
  if (p.old > p.price) return `<span class="badge sale">−${Math.round((1 - p.price / p.old) * 100)}%</span>`;
  if (p.stock <= 0) return `<span class="badge out">${L('Под заказ', 'To order')}</span>`;
  if (p.tags.includes('new')) return `<span class="badge">${L('Новинка', 'New')}</span>`;
  if (p.tags.includes('hit')) return `<span class="badge">${L('Хит', 'Bestseller')}</span>`;
  return '';
}

function card(p, i) {
  const a = avail(p);
  const mat = T(p.mat).split(',')[0];
  return `<li class="card" style="--i:${Math.min(i, 12)}">
    <div class="card-media">
      <img src="${thumb(p.imgs[0])}" alt="${esc(T(p.name))}" loading="lazy" width="640" height="800">
      ${p.imgs[1] ? `<img class="alt" src="${thumb(p.imgs[1])}" alt="" loading="lazy">` : ''}
      ${badge(p)}
      <button class="quick" type="button" data-add="${p.id}" aria-label="${L('В корзину', 'Add to bag')}: ${esc(T(p.name))}"><i class="ph ph-plus" aria-hidden="true"></i></button>
    </div>
    <button class="card-open" type="button" data-open="${p.id}" aria-label="${esc(T(p.name))}"></button>
    <div class="card-body">
      <h3 class="card-name">${esc(T(p.name))}</h3>
      <p class="card-meta">${esc(mat)}${p.dims?.[0] ? ' · ' + p.dims[0] + L(' см', ' cm') : ''}</p>
      <div class="card-row"><p class="price">${money(p.price)}${p.old > p.price ? `<s>${money(p.old)}</s>` : ''}</p>
        <div class="dots" aria-hidden="true">${p.colors.slice(0, 4).map((c) => `<span style="--c:${c[0]}"></span>`).join('')}</div></div>
      <p class="stock-note ${a.cls}">${esc(a.text)}</p>
    </div>
  </li>`;
}

// Редакционная вставка посреди каталога
function insert() {
  return `<li class="insert">
    <img src="${asset('img/room-b-s.webp')}" alt="" loading="lazy">
    <div class="insert-copy">
      <p class="insert-kicker">${L('Подборка', 'Edit')}</p>
      <p class="insert-title">${L('Дуб, лён и&nbsp;глина <em>с годами только красивее</em>', 'Oak, linen and clay <em>only get better with age</em>')}</p>
      <button class="btn btn-light" type="button" data-q="${L('дуб', 'oak')}">${L('Всё из дуба', 'Everything in oak')}<i class="ph ph-arrow-right" aria-hidden="true"></i></button>
    </div>
  </li>`;
}

function renderGrid() {
  const list = filtered();
  const html = list.map(card);
  const plain = F.cat === 'all' && !F.q && !F.min && !F.max && F.width >= 320 && !F.stock && !F.sale;
  if (plain && html.length > 8) html.splice(6, 0, insert());
  $('#grid').innerHTML = html.join('');
  $('#empty').hidden = !!list.length;
  const n = list.length;
  $('#catCount').textContent = EN ? `${n} ${n === 1 ? 'piece' : 'pieces'}` : `${n} ${plural(n, 'предмет', 'предмета', 'предметов')}`;
  const active = F.min || F.max || F.width < 320 || F.stock || F.sale;
  $('#filterDot').hidden = !active;
}
const plural = (n, a, b, c) => (n % 10 === 1 && n % 100 !== 11 ? a : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20) ? b : c);

function initFilters() {
  $('#q').addEventListener('input', (e) => { F.q = e.target.value; renderGrid(); });
  $('#sort').addEventListener('change', (e) => { F.sort = e.target.value; renderGrid(); });
  $('#fMin').addEventListener('input', (e) => { F.min = e.target.value; renderGrid(); });
  $('#fMax').addEventListener('input', (e) => { F.max = e.target.value; renderGrid(); });
  const wOut = () => ($('#fWidthOut').textContent = F.width >= 320 ? L('любую', 'any') : L(`до ${F.width} см`, `up to ${F.width} cm`));
  $('#fWidth').addEventListener('input', (e) => { F.width = +e.target.value; wOut(); renderGrid(); });
  $('#fStock').addEventListener('change', (e) => { F.stock = e.target.checked; renderGrid(); });
  $('#fSale').addEventListener('change', (e) => { F.sale = e.target.checked; renderGrid(); });
  $('#filterBtn').addEventListener('click', (e) => {
    const open = e.currentTarget.getAttribute('aria-expanded') !== 'true';
    e.currentTarget.setAttribute('aria-expanded', open);
    $('#filters').hidden = !open;
  });
  const reset = () => {
    Object.assign(F, { cat: 'all', q: '', min: '', max: '', width: 320, stock: false, sale: false });
    $('#q').value = $('#fMin').value = $('#fMax').value = '';
    $('#fWidth').value = 320; $('#fStock').checked = $('#fSale').checked = false; wOut();
    renderChips(); renderGrid();
  };
  $('#fReset').addEventListener('click', reset);
  $('[data-act="reset-filters"]').addEventListener('click', reset);
}

function setCat(id, scroll) {
  F.cat = id;
  renderChips(); renderGrid();
  $(`[data-chip="${id}"]`)?.scrollIntoView({ inline: 'center', block: 'nearest' });
  if (scroll) $('#catalog').scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
}

// ——— Карточка товара
const pd = $('#pd');
let cur = null;

function openProduct(id) {
  const p = db.product(id);
  if (!p) return;
  closePop();
  cur = { p, img: 0, color: p.colors[0]?.[0] || '', qty: 1, fitW: '', fitD: '' };
  db.track('product', id);
  renderProduct();
  if (!pd.open) pd.showModal();
  pd.scrollTop = 0; $('.pd-info', pd).scrollTop = 0;
  history.replaceState(null, '', '#' + id);
}

function renderProduct() {
  const { p } = cur;
  const a = avail(p);
  const color = p.colors.find((c) => c[0] === cur.color);
  const icon = a.cls === 'out' ? 'ph-clock' : a.cls === 'low' ? 'ph-warning-circle' : 'ph-check-circle';
  pd.innerHTML = `
    <div class="pd-gallery">
      <div class="pd-main"><img src="${asset(p.imgs[cur.img])}" alt="${esc(T(p.name))}" onload="this.classList.toggle('wide', this.naturalWidth > this.naturalHeight * 1.15)"></div>
      ${p.imgs.length > 1 ? `<div class="pd-thumbs">${p.imgs.map((im, i) => `<button type="button" data-img="${i}" aria-current="${i === cur.img}" aria-label="${L('Фото', 'Photo')} ${i + 1}"><img src="${thumb(im)}" alt=""></button>`).join('')}</div>` : ''}
    </div>
    <button class="icon-btn pd-close" type="button" data-act="close-pd" aria-label="${L('Закрыть', 'Close')}"><i class="ph ph-x" aria-hidden="true"></i></button>
    <div class="pd-info">
      <div>
        <p class="pd-crumb">${esc(catName(p.cat))} · ${esc(p.sku)}</p>
        <h2 class="pd-title" id="pdTitle">${esc(T(p.name))}</h2>
      </div>
      <div class="pd-price"><b>${money(p.price)}</b>${p.old > p.price ? `<s>${money(p.old)}</s><span class="save">${L('Выгода', 'Save')} ${money(p.old - p.price)}</span>` : ''}</div>
      <p class="pd-avail ${a.cls}"><i class="ph-fill ${icon}" aria-hidden="true"></i>${esc(a.text)}${a.cls !== 'out' ? L(' · доставка 1–3 дня', ' · delivery in 1–3 days') : ''}</p>
      ${p.colors.length ? `<div><p class="pd-label">${L('Цвет', 'Colour')}: <b>${esc(color ? (EN ? color[2] : color[1]) : '')}</b></p>
        <div class="swatches" role="radiogroup" aria-label="${L('Цвет', 'Colour')}">${p.colors.map((c) => `<button class="swatch" type="button" role="radio" data-color="${c[0]}" aria-checked="${c[0] === cur.color}" aria-label="${esc(EN ? c[2] : c[1])}" style="--c:${c[0]}"><span></span></button>`).join('')}</div></div>` : ''}
      <div class="buy">
        <div class="qty"><button type="button" data-qty="-1" aria-label="${L('Меньше', 'Fewer')}">−</button><output aria-live="polite">${cur.qty}</output><button type="button" data-qty="1" aria-label="${L('Больше', 'More')}">+</button></div>
        <button class="btn btn-primary" type="button" data-act="pd-add"><i class="ph ph-bag-simple" aria-hidden="true"></i>${p.stock > 0 ? L('В корзину', 'Add to bag') : L('Заказать', 'Pre-order')}</button>
      </div>
      <p class="pd-desc">${esc(T(p.desc))}</p>
      ${p.dims?.[0] && p.dims?.[1] ? fitBlock() : ''}
      <dl class="specs">
        <dt>${L('Размеры (Ш×Г×В)', 'Size (W×D×H)')}</dt><dd>${esc(dimsText(p.dims))}</dd>
        <dt>${L('Материалы', 'Materials')}</dt><dd>${esc(T(p.mat))}</dd>
        <dt>${L('Артикул', 'SKU')}</dt><dd>${esc(p.sku)}</dd>
        <dt>${L('Гарантия', 'Warranty')}</dt><dd>${['sofas', 'armchairs', 'beds', 'chairs'].includes(p.cat) ? L('5 лет на каркас', '5 years on the frame') : L('2 года', '2 years')}</dd>
      </dl>
    </div>`;
  if (p.dims?.[0] && p.dims?.[1]) updateFit();
}

function fitBlock() {
  return `<div class="fit">
    <p class="fit-head"><i class="ph ph-ruler" aria-hidden="true"></i>${L('Проверьте, влезет ли', 'Check it fits')}</p>
    <div class="fit-in">
      <label>${L('Ширина места, см', 'Space width, cm')}<input type="number" inputmode="numeric" min="0" data-fit="w" value="${cur.fitW}" placeholder="${L('напр. 250', 'e.g. 250')}"></label>
      <label>${L('Глубина места, см', 'Space depth, cm')}<input type="number" inputmode="numeric" min="0" data-fit="d" value="${cur.fitD}" placeholder="${L('напр. 110', 'e.g. 110')}"></label>
    </div>
    <div class="fit-plan"><svg viewBox="0 0 140 110" role="img" aria-label="${L('Вид сверху', 'Top view')}"></svg><p class="fit-verdict" aria-live="polite"></p></div>
  </div>`;
}

function updateFit() {
  const [pw, pdp] = cur.p.dims;
  const sw = +cur.fitW || 0, sd = +cur.fitD || 0;
  const W = Math.max(pw, sw), D = Math.max(pdp, sd);
  const k = Math.min(130 / W, 100 / D);
  const svg = $('.fit-plan svg', pd);
  const v = $('.fit-verdict', pd);
  const okW = !sw || pw <= sw, okD = !sd || pdp <= sd;
  const ok = okW && okD;
  const ix = 5 + (sw ? 0 : (130 - pw * k) / 2), iy = 5 + (sd ? (sd - pdp) * k : (100 - pdp * k) / 2);
  svg.innerHTML = (sw || sd ? `<rect class="space" x="5" y="5" width="${(sw || W) * k}" height="${(sd || D) * k}" rx="2"/>` : '') +
    `<rect class="item ${ok ? '' : 'bad'}" x="${ix}" y="${Math.max(5, iy)}" width="${pw * k}" height="${pdp * k}" rx="3"/>`;
  v.className = 'fit-verdict' + (sw || sd ? (ok ? ' ok' : ' bad') : '');
  if (!sw && !sd) { v.innerHTML = L(`<b>${pw} × ${pdp} см</b>Занимает на полу. Введите размеры ниши или стены.`, `<b>${pw} × ${pdp} cm</b>Floor footprint. Enter the size of your wall or alcove.`); return; }
  if (ok) {
    const left = [sw && L(`${sw - pw} см по ширине`, `${sw - pw} cm in width`), sd && L(`${sd - pdp} см по глубине`, `${sd - pdp} cm in depth`)].filter(Boolean).join(L(' и ', ' and '));
    v.innerHTML = `<b>${L('Влезет', 'It fits')}</b>${L('Останется ', 'Spare: ')}${left}.`;
  } else {
    const miss = [!okW && L(`${pw - sw} см по ширине`, `${pw - sw} cm in width`), !okD && L(`${pdp - sd} см по глубине`, `${pdp - sd} cm in depth`)].filter(Boolean).join(L(' и ', ' and '));
    v.innerHTML = `<b>${L('Не влезет', 'Too big')}</b>${L('Не хватает ', 'Short by ')}${miss}.`;
  }
}

pd.addEventListener('click', (e) => {
  if (e.target === pd) return pd.close();
  const t = e.target.closest('button');
  if (!t) return;
  if (t.dataset.act === 'close-pd') pd.close();
  else if (t.dataset.img) { cur.img = +t.dataset.img; renderProduct(); }
  else if (t.dataset.color) { cur.color = t.dataset.color; renderProduct(); }
  else if (t.dataset.qty) {
    cur.qty = Math.max(1, Math.min(maxQty(cur.p), cur.qty + +t.dataset.qty));
    $('.qty output', pd).textContent = cur.qty;
  } else if (t.dataset.act === 'pd-add') {
    if (addToCart(cur.p.id, cur.color, cur.qty)) pd.close();
  }
});
pd.addEventListener('input', (e) => {
  const f = e.target.dataset.fit;
  if (!f) return;
  cur[f === 'w' ? 'fitW' : 'fitD'] = e.target.value;
  updateFit();
});
pd.addEventListener('close', () => { if (location.hash) history.replaceState(null, '', location.pathname + location.search); });

// ——— Корзина и оформление
const dr = $('#cart');
let view = 'cart';
let lastOrder = null;
const form = { name: '', phone: '', delivery: 'delivery', address: '', comment: '' };

function openCart() { view = 'cart'; renderCart(); if (!dr.open) dr.showModal(); }

function renderCart() {
  const lines = cartLines();
  const s = db.settings();
  const sub = cartSum();
  const fee = form.delivery === 'delivery' && sub < s.freeDelivery ? s.deliveryFee : 0;
  const head = (title, back) => `<div class="dr-head">${back ? `<button class="icon-btn" type="button" data-act="back" aria-label="${L('Назад', 'Back')}"><i class="ph ph-arrow-left" aria-hidden="true"></i></button>` : ''}<h2 id="cartTitle">${title}</h2><button class="icon-btn" type="button" data-act="close-cart" aria-label="${L('Закрыть', 'Close')}"><i class="ph ph-x" aria-hidden="true"></i></button></div>`;

  if (view === 'done') {
    dr.innerHTML = head(L('Заказ принят', 'Order placed')) + `<div class="dr-body"><div class="done-box">
      <span class="big"><i class="ph ph-check" aria-hidden="true"></i></span>
      <h3>${L('Заказ', 'Order')} №${lastOrder.no}</h3>
      <p>${L(`Спасибо, ${esc(lastOrder.name.split(' ')[0])}! Менеджер позвонит на ${esc(lastOrder.phone)} в течение 15 минут, чтобы согласовать доставку.`, `Thank you, ${esc(lastOrder.name.split(' ')[0])}! A manager will call ${esc(lastOrder.phone)} within 15 minutes to arrange delivery.`)}</p>
      <p><b>${money(lastOrder.total)}</b> · ${L('оплата при получении или по ссылке Kaspi', 'pay on delivery or via Kaspi link')}</p>
      <button class="btn btn-ink" type="button" data-act="close-cart">${L('Вернуться в каталог', 'Back to the catalogue')}</button>
    </div></div>`;
    return;
  }

  if (!lines.length) {
    dr.innerHTML = head(L('Корзина', 'Bag')) + `<div class="dr-body"><div class="dr-empty"><i class="ph ph-armchair" aria-hidden="true"></i><b>${L('Пока пусто', 'Nothing here yet')}</b><p>${L('Нажмите + на любом товаре или возьмите комнату с первого экрана целиком.', 'Tap + on any piece or take the whole room from the first screen.')}</p><button class="btn btn-ghost" type="button" data-act="close-cart">${L('К каталогу', 'Browse')}</button></div></div>`;
    return;
  }

  const toFree = s.freeDelivery - sub;
  const freeBar = `<div class="free-bar">${toFree > 0 ? L(`До бесплатной доставки — ${money(toFree)}`, `${money(toFree)} more for free delivery`) : L('Доставка по Алматы — бесплатно', 'Free delivery in Almaty')}<i style="--p:${Math.min(100, (sub / s.freeDelivery) * 100)}%"></i></div>`;
  const totals = `<div class="sum-row"><span>${L('Товары', 'Items')}</span><span>${money(sub)}</span></div>
    <div class="sum-row"><span>${form.delivery === 'pickup' ? L('Самовывоз', 'Pickup') : L('Доставка', 'Delivery')}</span><span>${fee ? money(fee) : L('бесплатно', 'free')}</span></div>
    <div class="sum-row total"><span>${L('Итого', 'Total')}</span><span>${money(sub + fee)}</span></div>`;

  if (view === 'cart') {
    dr.innerHTML = head(L('Корзина', 'Bag')) + `<div class="dr-body">${lines.map((l, i) => {
      const c = l.p.colors.find((x) => x[0] === l.color);
      return `<div class="line">
        <img src="${thumb(l.p.imgs[0])}" alt="">
        <div><p class="line-name">${esc(T(l.p.name))}</p><p class="line-meta">${c ? esc(EN ? c[2] : c[1]) + ' · ' : ''}${esc(avail(l.p).text)}</p>
          <div class="qty"><button type="button" data-line="${i}" data-d="-1" aria-label="${L('Меньше', 'Fewer')}">−</button><output>${l.qty}</output><button type="button" data-line="${i}" data-d="1" aria-label="${L('Больше', 'More')}">+</button></div></div>
        <div class="line-side"><button class="icon-btn" type="button" data-del="${i}" aria-label="${L('Убрать', 'Remove')}"><i class="ph ph-trash" aria-hidden="true"></i></button><b>${money(l.p.price * l.qty)}</b></div>
      </div>`;
    }).join('')}</div>
    <div class="dr-foot">${freeBar}${totals}<button class="btn btn-primary" type="button" data-act="checkout">${L('Оформить заказ', 'Checkout')}<i class="ph ph-arrow-right" aria-hidden="true"></i></button></div>`;
    return;
  }

  // checkout
  dr.innerHTML = head(L('Оформление', 'Checkout'), true) + `<form class="dr-body form" id="orderForm" novalidate>
      <label class="field">${L('Имя', 'Name')}<input name="name" autocomplete="name" required value="${esc(form.name)}"></label>
      <label class="field">${L('Телефон', 'Phone')}<input name="phone" type="tel" autocomplete="tel" inputmode="tel" required placeholder="+7 7__ ___ __ __" value="${esc(form.phone)}"></label>
      <div class="seg" role="radiogroup" aria-label="${L('Способ получения', 'Delivery method')}">
        <label><input type="radio" name="delivery" value="delivery" ${form.delivery === 'delivery' ? 'checked' : ''}>${L('Доставка', 'Delivery')}<small>${L('1–3 дня, со сборкой', '1–3 days, assembled')}</small></label>
        <label><input type="radio" name="delivery" value="pickup" ${form.delivery === 'pickup' ? 'checked' : ''}>${L('Самовывоз', 'Pickup')}<small>${L('Абая, 150', '150 Abay Ave')}</small></label>
      </div>
      ${form.delivery === 'delivery' ? `<label class="field">${L('Адрес в Алматы', 'Address in Almaty')}<input name="address" autocomplete="street-address" required value="${esc(form.address)}" placeholder="${L('Улица, дом, квартира', 'Street, building, flat')}"></label>` : ''}
      <label class="field">${L('Комментарий', 'Comment')}<textarea name="comment" placeholder="${L('Этаж, лифт, удобное время', 'Floor, lift, best time')}">${esc(form.comment)}</textarea></label>
    </form>
    <div class="dr-foot">${totals}<button class="btn btn-primary" type="submit" form="orderForm">${L('Подтвердить заказ', 'Place order')}</button>
      <p class="free-bar">${L('Оплата при получении. Это демо: заказ попадёт в панель управления в этом браузере.', 'Pay on delivery. Demo: the order lands in the admin panel in this browser.')}</p></div>`;
}

function formatPhone(v) {
  let d = v.replace(/\D/g, '');
  if (d.startsWith('8')) d = '7' + d.slice(1);
  if (d && !d.startsWith('7')) d = '7' + d;
  d = d.slice(0, 11);
  const p = [d.slice(0, 1), d.slice(1, 4), d.slice(4, 7), d.slice(7, 9), d.slice(9, 11)];
  return d ? '+' + p.filter(Boolean).join(' ') : '';
}

dr.addEventListener('click', (e) => {
  if (e.target === dr) return dr.close();
  const t = e.target.closest('button');
  if (!t) return;
  const lines = cartLines();
  if (t.dataset.act === 'close-cart') dr.close();
  else if (t.dataset.act === 'checkout') { view = 'checkout'; renderCart(); $('input[name="name"]', dr)?.focus(); db.track('checkout'); }
  else if (t.dataset.act === 'back') { view = 'cart'; renderCart(); }
  else if (t.dataset.line) {
    const l = lines[+t.dataset.line];
    const line = cart.find((x) => x.pid === l.pid && x.color === l.color);
    line.qty = Math.max(1, Math.min(maxQty(l.p), line.qty + +t.dataset.d));
    saveCart(); renderCart();
  } else if (t.dataset.del) {
    const l = lines[+t.dataset.del];
    const idx = cart.findIndex((x) => x.pid === l.pid && x.color === l.color);
    const [removed] = cart.splice(idx, 1);
    saveCart(); renderCart();
    toast(L('Убрали из корзины', 'Removed from bag'), L('Вернуть', 'Undo'), () => { cart.splice(idx, 0, removed); saveCart(); if (dr.open) renderCart(); });
  }
});
dr.addEventListener('input', (e) => {
  const el = e.target;
  if (!el.name) return;
  if (el.name === 'phone') { el.value = formatPhone(el.value); }
  if (el.name === 'delivery') return;
  form[el.name] = el.value;
  el.removeAttribute('aria-invalid');
});
dr.addEventListener('change', (e) => { if (e.target.name === 'delivery') { form.delivery = e.target.value; renderCart(); } });
let sending = false;
dr.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (sending) return;
  const f = e.target;
  const bad = [];
  if (form.name.trim().length < 2) bad.push('name');
  if (form.phone.replace(/\D/g, '').length !== 11) bad.push('phone');
  if (form.delivery === 'delivery' && form.address.trim().length < 4) bad.push('address');
  bad.forEach((n) => f.elements[n]?.setAttribute('aria-invalid', 'true'));
  if (bad.length) { f.elements[bad[0]].focus(); toast(L('Проверьте выделенные поля', 'Please check the highlighted fields')); return; }
  const btn = dr.querySelector('button[type="submit"]');
  const label = btn.innerHTML;
  sending = true; btn.disabled = true; btn.innerHTML = `<i class="ph ph-spinner spin" aria-hidden="true"></i>${L('Отправляем…', 'Sending…')}`;
  try {
    lastOrder = await db.createOrder({ ...form, name: form.name.trim(), items: cartLines().map((l) => ({ pid: l.pid, qty: l.qty, color: (l.p.colors.find((c) => c[0] === l.color) || [])[EN ? 2 : 1] || '' })) });
  } catch (err) {
    toast(db.humanError(err));
    btn.disabled = false; btn.innerHTML = label;
    return;
  } finally { sending = false; }
  cart = []; saveCart();
  form.comment = '';
  view = 'done'; renderCart();
});
dr.addEventListener('close', () => { if (view === 'done') view = 'cart'; });

// ——— Общие клики
document.addEventListener('click', (e) => {
  const t = e.target.closest('button, a');
  if (!t) { if (!e.target.closest('#roomPop')) closePop(); return; }
  if (t.classList.contains('spot')) { t.getAttribute('aria-expanded') === 'true' ? closePop() : openPop(t); return; }
  if (t.dataset.open) { openProduct(t.dataset.open); return; }
  if (t.dataset.add) {
    const ok = addToCart(t.dataset.add);
    if (ok && t.classList.contains('quick')) { t.classList.add('done'); t.innerHTML = '<i class="ph ph-check" aria-hidden="true"></i>'; setTimeout(() => { t.classList.remove('done'); t.innerHTML = '<i class="ph ph-plus" aria-hidden="true"></i>'; }, 1400); }
    closePop();
    return;
  }
  if (t.dataset.chip) { setCat(t.dataset.chip); return; }
  if (t.dataset.q) { F.q = t.dataset.q; $('#q').value = F.q; renderGrid(); $('#catalog').scrollIntoView(); return; }
  if (t.dataset.cat) { setCat(t.dataset.cat, true); return; }
  const act = t.dataset.act;
  if (act === 'cart') openCart();
  else if (act === 'search') { $('#catalog').scrollIntoView(); setTimeout(() => $('#q').focus({ preventScroll: true }), 50); }
  else if (act === 'room-all') {
    let n = 0;
    for (const { p } of roomItems()) if (addToCart(p.id, null, 1, true)) n++;
    toast(L(`Добавили ${n} из ${roomItems().length} предметов`, `Added ${n} of ${roomItems().length} pieces`), L('Корзина', 'View bag'), openCart);
  }
  if (!t.closest('#roomPop') && !t.classList.contains('spot')) closePop();
});
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closePop(); });

// ——— Прочее
function renderAll() {
  if (!ready) return;
  renderRoom(); renderIndex(); renderChips(); renderGrid(); renderCartCount();
  if (pd.open && cur) { const p = db.product(cur.p.id); if (p) { cur.p = p; renderProduct(); } else pd.close(); }
  if (dr.open) renderCart();
}
db.onChange(renderAll);

const top = $('#top');
addEventListener('scroll', () => top.classList.toggle('scrolled', scrollY > 8), { passive: true });
$('#credits').textContent = PHOTO_CREDITS.join(', ');

$('#grid').innerHTML = Array.from({ length: 8 }, () => '<li class="card skel" aria-hidden="true"><div class="card-media"></div><div class="card-body"><span></span><span></span></div></li>').join('');
initFilters();
initPeek();
try {
  await db.init();
  ready = true;
  renderAll();
  db.track('visit');
} catch (err) {
  $('#grid').innerHTML = '';
  $('#empty').hidden = false;
  $('#empty .empty-title').textContent = L('Каталог не загрузился', 'The catalogue did not load');
  $('#empty p:not(.empty-title)').textContent = db.humanError(err);
  $('#empty button').textContent = L('Попробовать ещё раз', 'Try again');
  $('#empty button').onclick = () => location.reload();
}
// на телефоне показываем центр комнаты (диван), а не левый край
const rs = $('.room-scroll');
if (rs.scrollWidth > rs.clientWidth) rs.scrollLeft = (rs.scrollWidth - rs.clientWidth) * 0.45;
setTimeout(() => rs.addEventListener('scroll', () => $('#room').classList.add('panned'), { once: true, passive: true }), 300);
if (ready && location.hash.length > 1 && db.product(location.hash.slice(1))) openProduct(location.hash.slice(1));
