// Слой данных ТӨР: каталог, склад, заказы. Хранится в localStorage,
// поэтому витрина и админка в одном браузере видят одни и те же данные,
// а изменения прилетают в соседние вкладки через событие storage.
import { CATEGORIES, PRODUCTS, CUSTOMERS } from './data.js';

export const ROOT = new URL('../', import.meta.url).href;
export const EN = document.documentElement.lang === 'en';
export const L = (ru, en) => (EN ? en : ru);
export const T = (v) => (Array.isArray(v) ? (EN ? v[1] || v[0] : v[0] || v[1]) : v ?? '');
export const asset = (p) => (!p ? '' : /^(data:|https?:|blob:)/.test(p) ? p : ROOT + p);

const nf = new Intl.NumberFormat(EN ? 'en-US' : 'ru-RU');
export const money = (n) => nf.format(Math.round(n || 0)) + ' ₸';
export const num = (n) => nf.format(Math.round(n || 0));
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const KEY = 'tor:db:v1';
const DAY = 864e5;
const listeners = new Set();
let S = null;

export const STATUSES = ['new', 'confirmed', 'delivering', 'done', 'canceled'];
export const STATUS_NAME = {
  new: ['Новый', 'New'], confirmed: ['Подтверждён', 'Confirmed'], delivering: ['Доставка', 'Delivering'],
  done: ['Выполнен', 'Completed'], canceled: ['Отменён', 'Canceled'],
};
export const MOVE_NAME = {
  in: ['Приход', 'Receipt'], out: ['Списание', 'Write-off'], sale: ['Продажа', 'Sale'],
  return: ['Возврат', 'Return'], adjust: ['Инвентаризация', 'Stock count'],
};

const uid = () => Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-3);

function rng(seed) {
  return () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

// Заводские данные + правдоподобная история продаж за 30 дней
function seed() {
  const now = Date.now();
  const r = rng(20261005);
  const pick = (a) => a[Math.floor(r() * a.length)];
  const products = PRODUCTS.map((p) => ({
    id: p.id, sku: p.sku, cat: p.cat, name: [...p.name], desc: [...p.desc], mat: [...p.mat],
    price: p.p, old: p.old || 0, cost: p.cost, stock: p.stock, min: p.min, lead: p.lead || 14,
    dims: [...p.dims], colors: p.colors.map((c) => [...c]), tags: [...p.tags], imgs: [...p.img],
    visible: true, created: now - 60 * DAY,
  }));
  const byId = Object.fromEntries(products.map((p) => [p.id, p]));
  const sold = {};
  const orders = [];
  // дешёвые позиции продаются чаще
  const weighted = products.flatMap((p) => Array(p.price < 80000 ? 5 : p.price < 250000 ? 3 : 1).fill(p.id));
  let no = 1001;
  for (let i = 0; i < 48; i++) {
    const age = Math.pow(r(), 0.8) * 30; // дней назад
    const ts = now - age * DAY - r() * 6 * 36e5;
    const lines = {};
    const n = 1 + Math.floor(r() * r() * 3.2);
    for (let k = 0; k < n; k++) {
      const id = pick(weighted);
      const qty = byId[id].cat === 'chairs' ? 2 + Math.floor(r() * 4) : 1;
      lines[id] = (lines[id] || 0) + qty;
    }
    const items = Object.entries(lines).map(([pid, qty]) => {
      const p = byId[pid];
      return { pid, qty, price: p.price, cost: p.cost, name: [...p.name], color: p.colors[0]?.[1] || '' };
    });
    let status = age > 6 ? (r() < 0.1 ? 'canceled' : 'done') : age > 2 ? pick(['delivering', 'done', 'confirmed']) : pick(['new', 'new', 'confirmed']);
    const delivery = r() < 0.75 ? 'delivery' : 'pickup';
    orders.push({
      id: uid(), no: 0, ts, status, source: r() < 0.7 ? 'site' : 'store',
      name: pick(CUSTOMERS), phone: '+7 70' + Math.floor(r() * 8) + ' ' + String(100 + Math.floor(r() * 900)) + ' ' + String(10 + Math.floor(r() * 90)) + ' ' + String(10 + Math.floor(r() * 90)),
      delivery, address: delivery === 'delivery' ? pick(['мкр. Самал-2, 58', 'ул. Розыбакиева, 247', 'пр. Абая, 150', 'ул. Жандосова, 98', 'мкр. Орбита-3, 12', 'ул. Тимирязева, 42']) : '',
      comment: '', items, total: items.reduce((s, it) => s + it.price * it.qty, 0), stockApplied: status !== 'canceled',
    });
  }
  orders.sort((a, b) => a.ts - b.ts).forEach((o) => (o.no = no++));
  orders.reverse();

  const moves = [];
  for (const o of orders) if (o.stockApplied) for (const it of o.items) {
    sold[it.pid] = (sold[it.pid] || 0) + it.qty;
    moves.push({ id: uid(), ts: o.ts, pid: it.pid, qty: -it.qty, type: 'sale', note: '№' + o.no, cost: it.cost });
  }
  // списание брака, чтобы журнал был живой
  const wo = { pid: 'bota', qty: 1, ts: now - 9 * DAY };
  moves.push({ id: uid(), ts: wo.ts, pid: wo.pid, qty: -wo.qty, type: 'out', note: L('Скол при доставке', 'Damaged in delivery'), cost: byId.bota.cost });
  for (const p of products) {
    const opening = p.stock + (sold[p.id] || 0) + (p.id === wo.pid ? wo.qty : 0);
    if (opening <= 0) continue;
    const first = opening > 6 ? Math.ceil(opening * 0.6) : opening;
    moves.push({ id: uid(), ts: now - 40 * DAY, pid: p.id, qty: first, type: 'in', note: L('Начальный остаток', 'Opening balance'), cost: p.cost });
    if (opening > first) moves.push({ id: uid(), ts: now - (8 + Math.floor(r() * 10)) * DAY, pid: p.id, qty: opening - first, type: 'in', note: L('Поставка от фабрики', 'Factory delivery'), cost: p.cost });
  }
  moves.sort((a, b) => b.ts - a.ts);

  return {
    v: 1, products, categories: CATEGORIES.map((c) => ({ id: c.id, name: [...c.name] })), orders, moves,
    settings: { pin: '1234', freeDelivery: 300000, deliveryFee: 9000 }, nextNo: no,
  };
}

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) { const d = JSON.parse(raw); if (d && d.v === 1) return d; }
  } catch (e) { /* приватный режим или битые данные — начинаем с заводских */ }
  const d = seed();
  try { localStorage.setItem(KEY, JSON.stringify(d)); } catch (e) {}
  return d;
}

export function state() { return S || (S = load()); }

function commit(what) {
  try { localStorage.setItem(KEY, JSON.stringify(S)); }
  catch (e) {
    throw new Error(L('Хранилище браузера переполнено: уменьшите или удалите загруженные фото.', 'Browser storage is full: shrink or remove uploaded photos.'));
  }
  listeners.forEach((fn) => fn(what));
}

export function onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); }

window.addEventListener('storage', (e) => {
  if (e.key !== KEY) return;
  S = null; state();
  listeners.forEach((fn) => fn('external'));
});

// ——— Каталог
export const products = () => state().products;
export const categories = () => state().categories;
export const product = (id) => state().products.find((p) => p.id === id);
export const category = (id) => state().categories.find((c) => c.id === id);
export const settings = () => state().settings;

function slug(s) {
  const map = { а: 'a', ә: 'a', б: 'b', в: 'v', г: 'g', ғ: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z', и: 'i', й: 'i', к: 'k', қ: 'q', л: 'l', м: 'm', н: 'n', ң: 'n', о: 'o', ө: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ұ: 'u', ү: 'u', ф: 'f', х: 'h', һ: 'h', ц: 'c', ч: 'ch', ш: 'sh', щ: 'sh', ы: 'y', і: 'i', э: 'e', ю: 'yu', я: 'ya' };
  return (s || '').toLowerCase().replace(/[«»"]/g, '').split('').map((c) => map[c] ?? c).join('').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 24) || 'item';
}

export function nextSku(cat) {
  const prefix = { sofas: 'SF', armchairs: 'AC', chairs: 'CH', tables: 'TB', beds: 'BD', storage: 'ST', light: 'LT', decor: 'DC' }[cat] || cat.slice(0, 2).toUpperCase();
  const nums = products().filter((p) => p.sku.startsWith(prefix + '-')).map((p) => +p.sku.split('-')[1] || 0);
  const base = (categories().findIndex((c) => c.id === cat) + 1) * 100;
  return prefix + '-' + (Math.max(base, ...nums) + 1);
}

export function saveProduct(data) {
  const s = state();
  if (data.id && product(data.id)) {
    const p = product(data.id);
    const { stock, ...rest } = data; // остаток меняется только через склад
    Object.assign(p, rest);
    commit('product');
    return p;
  }
  let id = slug(T(data.name) || data.name?.[0]);
  while (product(id)) id += '-' + Math.floor(Math.random() * 90 + 10);
  const p = { visible: true, tags: [], colors: [], imgs: [], old: 0, min: 1, lead: 14, ...data, id, stock: 0, created: Date.now() };
  s.products.unshift(p);
  if (data.stock > 0) addMove({ pid: id, qty: +data.stock, type: 'in', note: L('Начальный остаток', 'Opening balance'), cost: p.cost }, true);
  commit('product');
  return p;
}

export function removeProduct(id) {
  const s = state();
  const i = s.products.findIndex((p) => p.id === id);
  if (i < 0) return null;
  const [p] = s.products.splice(i, 1);
  commit('product');
  return { p, i };
}

export function restoreProduct(snap) {
  state().products.splice(snap.i, 0, snap.p);
  commit('product');
}

export function setVisible(ids, visible) {
  for (const id of ids) { const p = product(id); if (p) p.visible = visible; }
  commit('product');
}

// ——— Категории
export function saveCategory(c) {
  const s = state();
  const ex = c.id && category(c.id);
  if (ex) ex.name = c.name;
  else {
    let id = slug(c.name[1] || c.name[0]);
    while (category(id)) id += '-2';
    s.categories.push({ id, name: c.name });
  }
  commit('category');
}

export function removeCategory(id, moveTo) {
  const s = state();
  for (const p of s.products) if (p.cat === id) p.cat = moveTo;
  s.categories = s.categories.filter((c) => c.id !== id);
  commit('category');
}

export function moveCategory(id, dir) {
  const a = state().categories;
  const i = a.findIndex((c) => c.id === id);
  const j = i + dir;
  if (j < 0 || j >= a.length) return;
  [a[i], a[j]] = [a[j], a[i]];
  commit('category');
}

// ——— Склад
function addMove(m, silent) {
  const s = state();
  const p = product(m.pid);
  if (!p) throw new Error('product not found');
  const mv = { id: uid(), ts: Date.now(), note: '', cost: p.cost, ...m };
  if (mv.type === 'in' && mv.qty > 0 && m.cost != null && p.stock + mv.qty > 0) {
    // средневзвешенная себестоимость
    p.cost = Math.round((Math.max(p.stock, 0) * p.cost + mv.qty * m.cost) / (Math.max(p.stock, 0) + mv.qty));
  }
  p.stock += mv.qty;
  s.moves.unshift(mv);
  if (!silent) commit('stock');
  return mv;
}

export function stockMove({ pid, type, qty, note, cost }) {
  const p = product(pid);
  qty = Math.round(+qty);
  if (type === 'adjust') {
    const diff = qty - p.stock;
    if (!diff) return null;
    return addMove({ pid, type, qty: diff, note: note || L(`Пересчёт: было ${p.stock}, стало ${qty}`, `Count: was ${p.stock}, now ${qty}`) });
  }
  if (type === 'out') qty = -Math.abs(qty);
  return addMove({ pid, type, qty, note, ...(type === 'in' && cost ? { cost: +cost } : {}) });
}

export const moves = () => state().moves;

// ——— Заказы
export const orders = () => state().orders;

export function createOrder(o) {
  const s = state();
  const items = o.items.map((it) => {
    const p = product(it.pid);
    return { pid: it.pid, qty: it.qty, price: p.price, cost: p.cost, name: [...p.name], color: it.color || '' };
  });
  const sub = items.reduce((a, it) => a + it.price * it.qty, 0);
  const fee = o.delivery === 'delivery' && sub < s.settings.freeDelivery ? s.settings.deliveryFee : 0;
  const order = {
    id: uid(), no: s.nextNo++, ts: Date.now(), status: 'new', source: o.source || 'site',
    name: o.name, phone: o.phone, delivery: o.delivery, address: o.address || '', comment: o.comment || '',
    items, fee, total: sub + fee, stockApplied: true,
  };
  s.orders.unshift(order);
  // резервируем товар сразу: на витрине остаток уменьшается
  for (const it of items) addMove({ pid: it.pid, qty: -it.qty, type: 'sale', note: '№' + order.no, cost: it.cost }, true);
  commit('order');
  return order;
}

export function setOrderStatus(id, status) {
  const o = orders().find((x) => x.id === id);
  if (!o || o.status === status) return;
  if (status === 'canceled' && o.stockApplied) {
    for (const it of o.items) if (product(it.pid)) addMove({ pid: it.pid, qty: it.qty, type: 'return', note: '№' + o.no, cost: it.cost }, true);
    o.stockApplied = false;
  } else if (o.status === 'canceled' && !o.stockApplied) {
    for (const it of o.items) if (product(it.pid)) addMove({ pid: it.pid, qty: -it.qty, type: 'sale', note: '№' + o.no, cost: it.cost }, true);
    o.stockApplied = true;
  }
  o.status = status;
  (o.log ||= []).push([Date.now(), status]);
  commit('order');
}

export function updateOrder(id, patch) {
  const o = orders().find((x) => x.id === id);
  Object.assign(o, patch);
  commit('order');
}

// ——— Сервис
export function exportJSON() { return JSON.stringify(state(), null, 1); }

export function importJSON(text) {
  const d = JSON.parse(text);
  if (!d || d.v !== 1 || !Array.isArray(d.products) || !Array.isArray(d.orders)) throw new Error(L('Это не резервная копия ТӨР', 'This is not a TÖR backup'));
  S = d;
  commit('import');
}

export function reset() { S = seed(); commit('reset'); }

export function setSettings(patch) { Object.assign(state().settings, patch); commit('settings'); }

// Выручка и прибыль: всё, кроме отменённых заказов
export function orderProfit(o) { return o.items.reduce((a, it) => a + (it.price - it.cost) * it.qty, 0); }
export const isSale = (o) => o.status !== 'canceled';
export const DAY_MS = DAY;
