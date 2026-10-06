// Боевой режим: данные в Supabase (Postgres). Схема и права — supabase/schema.sql.
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.2/+esm';
import { SUPABASE_URL, SUPABASE_KEY } from './config.js';
import { L, EN, slug, SKU_PREFIX, visitor, session, trafficSource } from './core.js';

const sb = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: true, storageKey: 'tor-auth', detectSessionInUrl: true } });
const listeners = new Set();
const emit = (e) => listeners.forEach((fn) => fn(e));
const S = { products: [], archived: [], categories: [], settings: { freeDelivery: 300000, deliveryFee: 9000 }, orders: [], moves: [], admins: [], me: null, admin: false };

const must = ({ data, error }) => { if (error) throw error; return data; };

// ——— Преобразование строк базы в объекты интерфейса и обратно
const ms = (t) => (t ? Date.parse(t) : 0);
const toProduct = (r) => ({
  id: r.id, sku: r.sku, cat: r.cat, name: [r.name_ru, r.name_en], desc: [r.desc_ru, r.desc_en], mat: [r.mat_ru, r.mat_en],
  price: r.price, old: r.old_price || 0, cost: r.cost ?? 0, stock: r.stock, min: r.min_stock, lead: r.lead_days,
  dims: r.dims || [0, 0, 0], colors: r.colors || [], tags: r.tags || [], imgs: r.imgs || [],
  visible: r.visible ?? true, archived: r.archived ?? false, created: ms(r.created_at), pop: r.pop ?? 999,
});
const fromProduct = (p) => ({
  sku: p.sku, cat: p.cat, name_ru: p.name[0], name_en: p.name[1] || '', desc_ru: p.desc[0] || '', desc_en: p.desc[1] || '',
  mat_ru: p.mat[0] || '', mat_en: p.mat[1] || '', price: p.price, old_price: p.old || 0, cost: p.cost || 0,
  min_stock: p.min, lead_days: p.lead, dims: p.dims, colors: p.colors, tags: p.tags, imgs: p.imgs, visible: p.visible,
});
const toOrder = (r) => ({
  id: r.id, no: r.num, ts: ms(r.created_at), status: r.status, source: r.source, name: r.name, phone: r.phone,
  delivery: r.delivery, address: r.address, comment: r.comment, note: r.note, items: r.items, fee: r.fee, total: r.total,
  stockApplied: r.stock_applied, log: r.log || [], visitor: r.visitor,
});
const toMove = (r) => ({ id: r.id, ts: ms(r.created_at), pid: r.product_id, qty: r.qty, type: r.type, note: r.note, cost: r.cost, author: r.author });
const toCat = (r) => ({ id: r.id, name: [r.name_ru, r.name_en], sort: r.sort });

// ——— Загрузка
async function loadPublic() {
  const [cat, cats, set] = await Promise.all([
    sb.from('catalog').select('*').order('created_at', { ascending: false }),
    sb.from('categories').select('*').order('sort'),
    sb.from('settings').select('*').eq('id', 1).maybeSingle(),
  ]);
  S.products = must(cat).map(toProduct);
  S.categories = must(cats).map(toCat);
  const s = must(set);
  if (s) S.settings = { freeDelivery: s.free_delivery, deliveryFee: s.delivery_fee };
}

const loaders = {
  products: async () => {
    const rows = must(await sb.from('products').select('*').order('created_at', { ascending: false }));
    const all = rows.map(toProduct);
    S.products = all.filter((p) => !p.archived);
    S.archived = all.filter((p) => p.archived);
  },
  categories: async () => { S.categories = must(await sb.from('categories').select('*').order('sort')).map(toCat); },
  settings: async () => { const s = must(await sb.from('settings').select('*').eq('id', 1).maybeSingle()); if (s) S.settings = { freeDelivery: s.free_delivery, deliveryFee: s.delivery_fee }; },
  orders: async () => { S.orders = must(await sb.from('orders').select('*').order('created_at', { ascending: false }).limit(2000)).map(toOrder); },
  moves: async () => { S.moves = must(await sb.from('stock_moves').select('*').order('created_at', { ascending: false }).limit(2000)).map(toMove); },
  admins: async () => { S.admins = must(await sb.from('admins').select('*').order('created_at')); },
};
async function reload(...names) { await Promise.all(names.map((n) => loaders[n]())); emit({ table: names.join(','), type: 'reload' }); }

let channel = null;
function subscribe() {
  if (channel) return;
  const upsert = (list, item) => { const i = list.findIndex((x) => x.id === item.id); if (i >= 0) list[i] = item; else list.unshift(item); };
  channel = sb.channel('tor-admin')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, (e) => {
      if (e.eventType === 'DELETE') S.orders = S.orders.filter((o) => o.id !== e.old.id);
      else upsert(S.orders, toOrder(e.new));
      S.orders.sort((a, b) => b.ts - a.ts);
      emit({ table: 'orders', type: e.eventType, row: e.new && toOrder(e.new) });
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'products' }, (e) => {
      if (e.eventType === 'DELETE') { S.products = S.products.filter((p) => p.id !== e.old.id); }
      else {
        const p = toProduct(e.new);
        S.products = S.products.filter((x) => x.id !== p.id); S.archived = S.archived.filter((x) => x.id !== p.id);
        (p.archived ? S.archived : S.products).unshift(p);
        S.products.sort((a, b) => b.created - a.created);
      }
      emit({ table: 'products', type: e.eventType });
    })
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'stock_moves' }, (e) => {
      if (!S.moves.some((m) => m.id === e.new.id)) S.moves.unshift(toMove(e.new));
      emit({ table: 'stock_moves', type: 'INSERT' });
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'categories' }, () => reload('categories'))
    .subscribe();
}

export const info = () => ({ mode: 'remote', label: L('Подключено к базе Supabase', 'Connected to Supabase'), host: new URL(SUPABASE_URL).host });

// admin=true: загружаем всё (если пользователь — сотрудник), иначе только публичный каталог
export async function init({ admin = false } = {}) {
  if (!admin) { await loadPublic(); return true; }
  const { data } = await sb.auth.getSession();
  if (!data.session) { S.me = null; return false; }
  S.me = must(await sb.rpc('me'));
  if (!S.me) return false;
  S.admin = true;
  await Promise.all(Object.values(loaders).map((f) => f()));
  subscribe();
  return true;
}

export const onChange = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };
export const products = () => S.products;
export const archived = () => S.archived;
export const categories = () => S.categories;
export const product = (id) => S.products.find((p) => p.id === id) || S.archived.find((p) => p.id === id);
export const category = (id) => S.categories.find((c) => c.id === id);
export const settings = () => S.settings;
export const orders = () => S.orders;
export const moves = () => S.moves;
export const admins = () => S.admins;
export const me = () => S.me;

export function nextSku(cat) {
  const prefix = SKU_PREFIX[cat] || cat.slice(0, 2).toUpperCase();
  const nums = [...S.products, ...S.archived].filter((p) => p.sku.startsWith(prefix + '-')).map((p) => +p.sku.split('-')[1] || 0);
  const base = (S.categories.findIndex((c) => c.id === cat) + 1) * 100;
  return prefix + '-' + (Math.max(base, ...nums) + 1);
}

// ——— Каталог
export async function saveProduct(data) {
  if (data.id && product(data.id)) {
    must(await sb.from('products').update(fromProduct(data)).eq('id', data.id));
    await reload('products');
    return product(data.id);
  }
  let id = slug(data.name[0]);
  while (product(id)) id += '-' + Math.floor(Math.random() * 90 + 10);
  must(await sb.from('products').insert({ id, ...fromProduct(data) }));
  if (data.stock > 0) must(await sb.rpc('stock_move', { p_pid: id, p_type: 'in', p_qty: +data.stock, p_note: 'Начальный остаток', p_cost: null }));
  await reload('products', 'moves');
  return product(id);
}
export async function archiveProduct(id) { must(await sb.from('products').update({ archived: true }).eq('id', id)); await reload('products'); return id; }
export async function restoreProduct(id) { must(await sb.from('products').update({ archived: false }).eq('id', id)); await reload('products'); }
export async function setVisible(ids, visible) { must(await sb.from('products').update({ visible }).in('id', ids)); await reload('products'); }

// ——— Категории
export async function saveCategory(c) {
  if (c.id && category(c.id)) must(await sb.from('categories').update({ name_ru: c.name[0], name_en: c.name[1] || '' }).eq('id', c.id));
  else {
    let id = slug(c.name[1] || c.name[0]);
    while (category(id)) id += '-2';
    must(await sb.from('categories').insert({ id, name_ru: c.name[0], name_en: c.name[1] || '', sort: S.categories.length }));
  }
  await reload('categories');
}
export async function removeCategory(id, moveTo) { must(await sb.rpc('delete_category', { p_id: id, p_move_to: moveTo })); await reload('categories', 'products'); }
export async function moveCategory(id, dir) {
  const a = [...S.categories];
  const i = a.findIndex((c) => c.id === id), j = i + dir;
  if (j < 0 || j >= a.length) return;
  [a[i], a[j]] = [a[j], a[i]];
  await Promise.all(a.map((c, k) => (c.sort !== k ? sb.from('categories').update({ sort: k }).eq('id', c.id) : null)).filter(Boolean));
  await reload('categories');
}

// ——— Склад
export async function stockMove({ pid, type, qty, note, cost }) {
  const mv = must(await sb.rpc('stock_move', { p_pid: pid, p_type: type, p_qty: Math.round(+qty), p_note: note || '', p_cost: cost ?? null }));
  await reload('products', 'moves');
  return mv;
}

// ——— Заказы
export async function createOrder(o) {
  const [sid] = session();
  const res = must(await sb.rpc('place_order', { p: { ...o, visitor: o.source === 'store' ? null : visitor(), session: o.source === 'store' ? null : sid, lang: EN ? 'en' : 'ru' } }));
  if (S.admin) await reload('orders', 'products', 'moves'); else await loadPublic().then(() => emit({ table: 'products', type: 'reload' })).catch(() => {});
  return res;
}
export async function setOrderStatus(id, status) { must(await sb.rpc('set_order_status', { p_id: id, p_status: status })); await reload('orders', 'products', 'moves'); }
export async function updateOrder(id, patch) {
  const allowed = ['name', 'phone', 'delivery', 'address', 'comment', 'note'];
  const row = Object.fromEntries(Object.entries(patch).filter(([k]) => allowed.includes(k)));
  must(await sb.from('orders').update(row).eq('id', id));
  await reload('orders');
}

// ——— Воронка и сводка
export function track(type, pid) {
  const [sid, fresh] = session();
  if (type === 'visit' && !fresh) return;
  sb.from('events').insert({ visitor: visitor(), session: sid, type, product_id: pid || null, source: type === 'visit' ? trafficSource() : null, lang: EN ? 'en' : 'ru' })
    .then(() => {}, () => {});
}
export async function dashboard(days = 30) { return must(await sb.rpc('dashboard', { p_days: days })); }

// ——— Фото в Supabase Storage
export async function uploadImage(blob) {
  const ext = blob.type === 'image/webp' ? 'webp' : 'jpg';
  const path = `${new Date().toISOString().slice(0, 7)}/${crypto.randomUUID()}.${ext}`;
  must(await sb.storage.from('products').upload(path, blob, { contentType: blob.type, cacheControl: '31536000' }));
  return sb.storage.from('products').getPublicUrl(path).data.publicUrl;
}

// ——— Вход сотрудников (email + пароль)
const here = () => location.origin + location.pathname;
export const auth = {
  mode: 'email',
  async session() { const { data } = await sb.auth.getSession(); return !!data.session; },
  async user() { const { data } = await sb.auth.getSession(); return data.session?.user || null; },
  async signIn(email, password) { must(await sb.auth.signInWithPassword({ email: email.trim().toLowerCase(), password })); },
  async signUp(email, password) {
    const d = must(await sb.auth.signUp({ email: email.trim().toLowerCase(), password, options: { emailRedirectTo: here() } }));
    return { confirm: !d.session };
  },
  async reset(email) { must(await sb.auth.resetPasswordForEmail(email.trim().toLowerCase(), { redirectTo: here() })); },
  async newPassword(password) { must(await sb.auth.updateUser({ password })); },
  async signOut() { if (channel) { sb.removeChannel(channel); channel = null; } S.admin = false; await sb.auth.signOut(); },
  onRecovery(fn) { sb.auth.onAuthStateChange((ev) => { if (ev === 'PASSWORD_RECOVERY') fn(); }); },
};

// ——— Команда
export async function addAdmin(email, role = 'manager', name = '') { must(await sb.from('admins').insert({ email: email.trim().toLowerCase(), role, name })); await reload('admins'); }
export async function removeAdmin(email) { must(await sb.from('admins').delete().eq('email', email)); await reload('admins'); }

// ——— Сервис
export async function setSettings(patch) {
  const row = {};
  if ('freeDelivery' in patch) row.free_delivery = patch.freeDelivery;
  if ('deliveryFee' in patch) row.delivery_fee = patch.deliveryFee;
  if (Object.keys(row).length) { must(await sb.from('settings').update({ ...row, updated_at: new Date().toISOString() }).eq('id', 1)); await reload('settings'); }
  if ('pin' in patch) throw new Error(L('В боевом режиме вход по email и паролю', 'Live mode uses email and password'));
}
export async function wipe() { must(await sb.rpc('wipe_activity')); await reload('orders', 'moves', 'products'); }
export async function exportJSON() {
  return JSON.stringify({ exported: new Date().toISOString(), products: [...S.products, ...S.archived], categories: S.categories, orders: S.orders, moves: S.moves, settings: S.settings }, null, 1);
}
export async function importJSON() { throw new Error(L('Восстановление копии в боевой базе делается через Supabase (Database → Backups)', 'Restore live backups in Supabase (Database → Backups)')); }
