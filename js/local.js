// Демо-режим без сервера: всё в localStorage этого браузера.
// Включается, пока в js/config.js не указан проект Supabase. Интерфейс тот же, что у remote.js.
import { CATEGORIES, PRODUCTS, CUSTOMERS } from './data.js';
import { L, DAY_MS as DAY, slug, SKU_PREFIX, orderProfit, visitor, session, trafficSource } from './core.js';

const KEY = 'tor:db:v2';
const listeners = new Set();
let S = null;

const uid = () => Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-3);
function rng(seed) {
  return () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

// Заводские данные + правдоподобная история продаж и визитов за 30 дней
function seed() {
  const now = Date.now();
  const r = rng(20261006);
  const pick = (a) => a[Math.floor(r() * a.length)];
  const products = PRODUCTS.map((p, i) => ({
    id: p.id, sku: p.sku, cat: p.cat, name: [...p.name], desc: [...p.desc], mat: [...p.mat],
    price: p.p, old: p.old || 0, cost: p.cost, stock: p.stock, min: p.min, lead: p.lead || 14,
    dims: [...p.dims], colors: p.colors.map((c) => [...c]), tags: [...p.tags], imgs: [...p.img],
    visible: true, archived: false, created: now - 60 * DAY - i * 6e4,
  }));
  const byId = Object.fromEntries(products.map((p) => [p.id, p]));
  const weighted = products.flatMap((p) => Array(p.price < 80000 ? 5 : p.price < 250000 ? 3 : 1).fill(p.id));
  const sources = ['direct', 'direct', 'direct', 'instagram', 'instagram', 'instagram', 'google', 'google', '2gis', 'whatsapp'];
  const orders = [], events = [];
  const ev = (ts, v, s, y, p, src) => events.push({ t: Math.round(ts), v, s, y, ...(p ? { p } : {}), ...(src ? { src } : {}) });

  // визиты без покупки
  for (let d = 0; d < 30; d++) {
    const n = 22 + Math.floor(r() * 26);
    for (let k = 0; k < n; k++) {
      const ts = now - d * DAY - r() * DAY;
      const v = uid(), s = uid();
      ev(ts, v, s, 'visit', null, pick(sources));
      if (r() < 0.64) {
        const views = 1 + Math.floor(r() * 3);
        const seen = [];
        for (let j = 0; j < views; j++) { const p = pick(weighted); seen.push(p); ev(ts + j * 4e4, v, s, 'product', p); }
        if (r() < 0.2) { ev(ts + 2e5, v, s, 'cart', seen[0]); if (r() < 0.4) ev(ts + 3e5, v, s, 'checkout'); }
      }
    }
  }

  let no = 1001;
  for (let i = 0; i < 48; i++) {
    const age = Math.pow(r(), 0.8) * 29.5;
    const ts = now - age * DAY - r() * 6 * 36e5;
    const lines = {};
    const n = 1 + Math.floor(r() * r() * 3.2);
    for (let k = 0; k < n; k++) {
      const id = pick(weighted);
      lines[id] = (lines[id] || 0) + (byId[id].cat === 'chairs' ? 2 + Math.floor(r() * 4) : 1);
    }
    const items = Object.entries(lines).map(([pid, qty]) => {
      const p = byId[pid];
      return { pid, qty, price: p.price, cost: p.cost, name: [...p.name], color: p.colors[0]?.[1] || '' };
    });
    const status = age > 6 ? (r() < 0.1 ? 'canceled' : 'done') : age > 2 ? pick(['delivering', 'done', 'confirmed']) : pick(['new', 'new', 'confirmed']);
    const delivery = r() < 0.75 ? 'delivery' : 'pickup';
    const source = r() < 0.75 ? 'site' : 'store';
    const v = uid(), s = uid();
    if (source === 'site') {
      ev(ts - 9e5, v, s, 'visit', null, pick(sources));
      items.forEach((it, j) => { ev(ts - 8e5 + j * 3e4, v, s, 'product', it.pid); ev(ts - 5e5 + j * 3e4, v, s, 'cart', it.pid); });
      ev(ts - 2e5, v, s, 'checkout'); ev(ts, v, s, 'order');
    }
    const sub = items.reduce((a, it) => a + it.price * it.qty, 0);
    const fee = delivery === 'delivery' && sub < 300000 ? 9000 : 0;
    orders.push({
      id: uid(), no: 0, ts, status, source, visitor: v, note: '',
      name: pick(CUSTOMERS), phone: '+7 70' + Math.floor(r() * 8) + ' ' + String(100 + Math.floor(r() * 900)) + ' ' + String(10 + Math.floor(r() * 90)) + ' ' + String(10 + Math.floor(r() * 90)),
      delivery, address: delivery === 'delivery' ? pick(['мкр. Самал-2, 58', 'ул. Розыбакиева, 247', 'пр. Абая, 150', 'ул. Жандосова, 98', 'мкр. Орбита-3, 12', 'ул. Тимирязева, 42']) : '',
      comment: '', items, fee, total: sub + fee, stockApplied: status !== 'canceled', log: [[ts, 'new', null], ...(status !== 'new' ? [[ts + 36e5, status, 'demo']] : [])],
    });
  }
  orders.sort((a, b) => a.ts - b.ts).forEach((o) => (o.no = no++));
  orders.reverse();
  events.sort((a, b) => a.t - b.t);

  const moves = [], sold = {};
  for (const o of orders) if (o.stockApplied) for (const it of o.items) {
    sold[it.pid] = (sold[it.pid] || 0) + it.qty;
    moves.push({ id: uid(), ts: o.ts, pid: it.pid, qty: -it.qty, type: 'sale', note: '№' + o.no, cost: it.cost });
  }
  const wo = { pid: 'bota', qty: 1, ts: now - 9 * DAY };
  moves.push({ id: uid(), ts: wo.ts, pid: wo.pid, qty: -1, type: 'out', note: 'Скол при доставке', cost: byId.bota.cost, author: 'demo' });
  for (const p of products) {
    const opening = p.stock + (sold[p.id] || 0) + (p.id === wo.pid ? wo.qty : 0);
    if (opening <= 0) continue;
    const first = opening > 6 ? Math.ceil(opening * 0.6) : opening;
    moves.push({ id: uid(), ts: now - 40 * DAY, pid: p.id, qty: first, type: 'in', note: 'Начальный остаток', cost: p.cost });
    if (opening > first) moves.push({ id: uid(), ts: now - (8 + Math.floor(r() * 10)) * DAY, pid: p.id, qty: opening - first, type: 'in', note: 'Поставка от фабрики', cost: p.cost, author: 'demo' });
  }
  moves.sort((a, b) => b.ts - a.ts);

  return {
    v: 2, products, categories: CATEGORIES.map((c) => ({ id: c.id, name: [...c.name] })), orders, moves, events,
    settings: { pin: '1234', freeDelivery: 300000, deliveryFee: 9000 }, nextNo: no,
  };
}

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) { const d = JSON.parse(raw); if (d && d.v === 2) return d; }
  } catch (e) { /* приватный режим или битые данные */ }
  const d = seed();
  try { localStorage.setItem(KEY, JSON.stringify(d)); } catch (e) {}
  return d;
}
const st = () => S || (S = load());

function commit(table, type = 'update', row) {
  try { localStorage.setItem(KEY, JSON.stringify(S)); }
  catch (e) { throw new Error(L('Хранилище браузера переполнено: уменьшите или удалите загруженные фото.', 'Browser storage is full: shrink or remove uploaded photos.')); }
  listeners.forEach((fn) => fn({ table, type, row, local: true }));
}

addEventListener('storage', (e) => {
  if (e.key !== KEY) return;
  const before = S?.orders?.[0]?.id;
  S = null; st();
  const fresh = S.orders[0];
  const isNew = fresh && fresh.id !== before && Date.now() - fresh.ts < 6e4;
  listeners.forEach((fn) => fn({ table: isNew ? 'orders' : 'all', type: isNew ? 'INSERT' : 'update', row: isNew ? fresh : null }));
});

// ——— Общее
export const info = () => ({ mode: 'local', label: L('Демо-режим: данные в этом браузере', 'Demo mode: data lives in this browser') });
export async function init() { st(); return true; }
export const onChange = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };

export const products = () => st().products.filter((p) => !p.archived).map(withPop);
export const archived = () => st().products.filter((p) => p.archived);
export const categories = () => st().categories;
export const product = (id) => st().products.find((p) => p.id === id);
export const category = (id) => st().categories.find((c) => c.id === id);
export const settings = () => st().settings;
export const orders = () => st().orders;
export const moves = () => st().moves;
export const admins = () => [];
export const me = () => ({ email: 'demo', role: 'owner', name: '' });

// рейтинг популярности, как в представлении catalog в базе
let popCache = null, popKey = '';
function withPop(p) {
  const k = st().moves.length + ':' + st().products.length;
  if (k !== popKey) {
    const sold = {};
    const since = Date.now() - 90 * DAY;
    for (const m of st().moves) if ((m.type === 'sale' || m.type === 'return') && m.ts > since) sold[m.pid] = (sold[m.pid] || 0) - m.qty;
    const ranked = [...st().products].sort((a, b) => (sold[b.id] || 0) - (sold[a.id] || 0) || b.created - a.created);
    popCache = Object.fromEntries(ranked.map((x, i) => [x.id, i + 1])); popKey = k;
  }
  p.pop = popCache[p.id] || 999;
  return p;
}

export function nextSku(cat) {
  const prefix = SKU_PREFIX[cat] || cat.slice(0, 2).toUpperCase();
  const nums = st().products.filter((p) => p.sku.startsWith(prefix + '-')).map((p) => +p.sku.split('-')[1] || 0);
  const base = (categories().findIndex((c) => c.id === cat) + 1) * 100;
  return prefix + '-' + (Math.max(base, ...nums) + 1);
}

// ——— Каталог
export async function saveProduct(data) {
  if (data.id && product(data.id)) {
    const p = product(data.id);
    const { stock, ...rest } = data; // остаток меняется только через склад
    Object.assign(p, rest);
    commit('products', 'UPDATE', p);
    return p;
  }
  if (st().products.some((p) => p.sku === data.sku)) throw new Error(L('Такой артикул уже есть', 'This SKU already exists'));
  let id = slug(data.name?.[0]);
  while (product(id)) id += '-' + Math.floor(Math.random() * 90 + 10);
  const p = { visible: true, archived: false, tags: [], colors: [], imgs: [], old: 0, min: 1, lead: 14, ...data, id, stock: 0, created: Date.now() };
  st().products.unshift(p);
  if (data.stock > 0) addMove({ pid: id, qty: +data.stock, type: 'in', note: 'Начальный остаток', cost: p.cost });
  commit('products', 'INSERT', p);
  return p;
}

export async function archiveProduct(id) { const p = product(id); if (p) { p.archived = true; commit('products', 'UPDATE', p); } return id; }
export async function restoreProduct(id) { const p = product(id); if (p) { p.archived = false; commit('products', 'UPDATE', p); } }
export async function setVisible(ids, visible) { for (const id of ids) { const p = product(id); if (p) p.visible = visible; } commit('products'); }

// ——— Категории
export async function saveCategory(c) {
  const ex = c.id && category(c.id);
  if (ex) ex.name = c.name;
  else {
    let id = slug(c.name[1] || c.name[0]);
    while (category(id)) id += '-2';
    st().categories.push({ id, name: c.name });
  }
  commit('categories');
}
export async function removeCategory(id, moveTo) {
  for (const p of st().products) if (p.cat === id) p.cat = moveTo;
  S.categories = S.categories.filter((c) => c.id !== id);
  commit('categories');
}
export async function moveCategory(id, dir) {
  const a = st().categories;
  const i = a.findIndex((c) => c.id === id), j = i + dir;
  if (j < 0 || j >= a.length) return;
  [a[i], a[j]] = [a[j], a[i]];
  commit('categories');
}

// ——— Склад
function addMove(m) {
  const p = product(m.pid);
  const mv = { id: uid(), ts: Date.now(), note: '', cost: p.cost, ...m, author: 'author' in m ? m.author : 'demo' };
  if (mv.type === 'in' && mv.qty > 0 && m.newCost != null) {
    p.cost = Math.round((Math.max(p.stock, 0) * p.cost + mv.qty * m.newCost) / (Math.max(p.stock, 0) + mv.qty));
    mv.cost = m.newCost; delete mv.newCost;
  }
  p.stock += mv.qty;
  st().moves.unshift(mv);
  return mv;
}

export async function stockMove({ pid, type, qty, note, cost }) {
  const p = product(pid);
  qty = Math.round(+qty);
  let mv;
  if (type === 'adjust') {
    const diff = qty - p.stock;
    if (!diff) return null;
    mv = addMove({ pid, type, qty: diff, note: note || `Пересчёт: было ${p.stock}, стало ${qty}` });
  } else {
    mv = addMove({ pid, type, qty: type === 'out' ? -Math.abs(qty) : qty, note, ...(type === 'in' && cost != null ? { newCost: +cost } : {}) });
  }
  commit('stock_moves', 'INSERT', mv);
  return mv;
}

// ——— Заказы
export async function createOrder(o) {
  const s = st();
  const store = o.source === 'store';
  const items = o.items.map((it) => {
    const p = product(it.pid);
    if (!p || p.archived || (!store && !p.visible)) throw new Error('unavailable');
    if (!store && p.stock > 0 && it.qty > p.stock) throw new Error(`not_enough:${p.id}:${p.stock}`);
    return { pid: it.pid, qty: it.qty, price: p.price, cost: p.cost, name: [...p.name], color: it.color || '' };
  });
  const sub = items.reduce((a, it) => a + it.price * it.qty, 0);
  const fee = o.delivery === 'delivery' && sub < s.settings.freeDelivery ? s.settings.deliveryFee : 0;
  const status = store ? 'confirmed' : 'new';
  const order = {
    id: uid(), no: s.nextNo++, ts: Date.now(), status, source: store ? 'store' : 'site',
    name: o.name, phone: o.phone || '', delivery: o.delivery, address: o.address || '', comment: o.comment || '', note: '',
    items, fee, total: sub + fee, stockApplied: true, log: [[Date.now(), status, store ? 'demo' : null]], visitor: store ? null : visitor(),
  };
  s.orders.unshift(order);
  for (const it of items) addMove({ pid: it.pid, qty: -it.qty, type: 'sale', note: '№' + order.no, cost: it.cost, author: store ? 'demo' : null });
  if (!store) { const [sid] = session(); s.events.push({ t: Date.now(), v: visitor(), s: sid, y: 'order' }); }
  commit('orders', 'INSERT', order);
  return { id: order.id, no: order.no, total: order.total, name: order.name, phone: order.phone };
}

export async function setOrderStatus(id, status) {
  const o = orders().find((x) => x.id === id);
  if (!o || o.status === status) return;
  if (status === 'canceled' && o.stockApplied) {
    for (const it of o.items) if (product(it.pid)) addMove({ pid: it.pid, qty: it.qty, type: 'return', note: '№' + o.no, cost: it.cost });
    o.stockApplied = false;
  } else if (o.status === 'canceled' && !o.stockApplied) {
    for (const it of o.items) if (product(it.pid)) addMove({ pid: it.pid, qty: -it.qty, type: 'sale', note: '№' + o.no, cost: it.cost });
    o.stockApplied = true;
  }
  o.status = status;
  (o.log ||= []).push([Date.now(), status, 'demo']);
  commit('orders', 'UPDATE', o);
}

export async function updateOrder(id, patch) {
  const o = orders().find((x) => x.id === id);
  const allowed = ['name', 'phone', 'delivery', 'address', 'comment', 'note'];
  for (const k of allowed) if (k in patch) o[k] = patch[k];
  commit('orders', 'UPDATE', o);
}

// ——— Воронка и сводка
export function track(type, pid) {
  try {
    const s = st();
    const [sid, fresh] = session();
    if (type === 'visit' && !fresh) return;
    s.events.push({ t: Date.now(), v: visitor(), s: sid, y: type, ...(pid ? { p: pid } : {}), ...(type === 'visit' ? { src: trafficSource() } : {}) });
    if (s.events.length > 20000) s.events.splice(0, s.events.length - 20000);
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch (e) { /* статистика не должна ломать сайт */ }
}

const dayKey = (ts) => { const d = new Date(ts); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

export async function dashboard(P = 30) {
  const s = st();
  const start = new Date(); start.setHours(0, 0, 0, 0);
  const t0 = start.getTime() - (P - 1) * DAY, tp = t0 - P * DAY;
  const sales = s.orders.filter((o) => o.ts >= t0 && o.status !== 'canceled');
  const prev = s.orders.filter((o) => o.ts >= tp && o.ts < t0 && o.status !== 'canceled');
  const ev = s.events.filter((e) => e.t >= t0);
  const evp = s.events.filter((e) => e.t >= tp && e.t < t0);
  const sum = (a, f) => a.reduce((x, y) => x + f(y), 0);
  const sessionsOf = (list, y) => new Set(list.filter((e) => e.y === y).map((e) => e.s));

  const days = Array.from({ length: P }, (_, i) => ({ d: dayKey(t0 + i * DAY + 36e5), rev: 0, orders: 0, visits: 0, _v: new Set() }));
  const idx = Object.fromEntries(days.map((d, i) => [d.d, i]));
  for (const o of sales) { const d = days[idx[dayKey(o.ts)]]; if (d) { d.rev += o.total; d.orders++; } }
  for (const e of ev) if (e.y === 'visit') { const d = days[idx[dayKey(e.t)]]; if (d) d._v.add(e.s); }
  days.forEach((d) => { d.visits = d._v.size; delete d._v; });

  const visitSrc = {};
  for (const e of ev) if (e.y === 'visit') visitSrc[e.s] = e.src || 'direct';
  const orderSess = sessionsOf(ev, 'order');
  const srcAgg = {};
  for (const [sid, src] of Object.entries(visitSrc)) { (srcAgg[src] ||= { source: src, visits: 0, orders: 0 }).visits++; if (orderSess.has(sid)) srcAgg[src].orders++; }

  const prod = {};
  const P_ = (pid) => (prod[pid] ||= { pid, name: product(pid)?.name || null, qty: 0, rev: 0, views: 0, carts: 0 });
  for (const o of sales) for (const it of o.items) { const x = P_(it.pid); x.qty += it.qty; x.rev += it.qty * it.price; x.name ||= it.name; }
  for (const e of ev) if (e.p && (e.y === 'product' || e.y === 'cart')) P_(e.p)[e.y === 'product' ? 'views' : 'carts']++;

  const cats = {};
  for (const o of sales) for (const it of o.items) { const c = product(it.pid)?.cat || '_'; cats[c] = (cats[c] || 0) + it.qty * it.price; }

  return {
    days,
    totals: {
      rev: sum(sales, (o) => o.total), goods: sum(sales, (o) => o.total - (o.fee || 0)), orders: sales.length, profit: sum(sales, orderProfit),
      prevRev: sum(prev, (o) => o.total), prevOrders: prev.length,
      visits: sessionsOf(ev, 'visit').size, prevVisits: sessionsOf(evp, 'visit').size,
      visitors: new Set(ev.filter((e) => e.y === 'visit').map((e) => e.v)).size,
      canceled: s.orders.filter((o) => o.ts >= t0 && o.status === 'canceled').length,
    },
    funnel: { visit: sessionsOf(ev, 'visit').size, product: sessionsOf(ev, 'product').size, cart: sessionsOf(ev, 'cart').size, checkout: sessionsOf(ev, 'checkout').size, order: orderSess.size },
    sources: Object.values(srcAgg).sort((a, b) => b.visits - a.visits).slice(0, 8),
    products: Object.values(prod).sort((a, b) => b.rev - a.rev || b.views - a.views),
    cats: Object.entries(cats).map(([cat, rev]) => ({ cat, rev })).sort((a, b) => b.rev - a.rev),
  };
}

// ——— Фото: в демо храним прямо в базе браузера
export async function uploadImage(blob) {
  return new Promise((res, rej) => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.onerror = rej; fr.readAsDataURL(blob); });
}

// ——— Вход по PIN (в демо-режиме это просто заглушка)
const AUTH = 'tor:admin';
export const auth = {
  mode: 'pin',
  async session() { try { return sessionStorage.getItem(AUTH) === '1'; } catch (e) { return true; } },
  async signIn(pin) {
    if (String(pin) !== String(settings().pin)) throw new Error(L('Неверный PIN', 'Wrong PIN'));
    try { sessionStorage.setItem(AUTH, '1'); } catch (e) {}
  },
  async signOut() { try { sessionStorage.removeItem(AUTH); } catch (e) {} },
};

export async function addAdmin() { throw new Error(L('Команда доступна после подключения базы', 'Team management needs the database')); }
export async function removeAdmin() {}

// ——— Сервис
export async function setSettings(patch) { Object.assign(st().settings, patch); commit('settings'); }
export async function wipe() { S = seed(); commit('all', 'reset'); }
export async function exportJSON() { return JSON.stringify(st(), null, 1); }
export async function importJSON(text) {
  const d = JSON.parse(text);
  if (!d || d.v !== 2 || !Array.isArray(d.products) || !Array.isArray(d.orders)) throw new Error(L('Это не резервная копия ТӨР', 'This is not a TÖR backup'));
  S = d; commit('all', 'import');
}
