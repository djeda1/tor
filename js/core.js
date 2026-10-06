// Общие помощники витрины и админки: язык, форматирование, справочники статусов.
export const ROOT = new URL('../', import.meta.url).href;
export const EN = document.documentElement.lang === 'en';
export const L = (ru, en) => (EN ? en : ru);
export const T = (v) => (Array.isArray(v) ? (EN ? v[1] || v[0] : v[0] || v[1]) : v ?? '');
export const asset = (p) => (!p ? '' : /^(data:|https?:|blob:)/.test(p) ? p : ROOT + p);
export const thumb = (p) => asset(/^img\/.+\.webp$/.test(p || '') ? p.replace(/\.webp$/, '-s.webp') : p);

const nf = new Intl.NumberFormat(EN ? 'en-US' : 'ru-RU');
export const money = (n) => nf.format(Math.round(n || 0)) + ' ₸';
export const num = (n) => nf.format(Math.round(n || 0));
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export const DAY_MS = 864e5;
export const STATUSES = ['new', 'confirmed', 'delivering', 'done', 'canceled'];
export const STATUS_NAME = {
  new: ['Новый', 'New'], confirmed: ['Подтверждён', 'Confirmed'], delivering: ['Доставка', 'Delivering'],
  done: ['Выполнен', 'Completed'], canceled: ['Отменён', 'Canceled'],
};
export const MOVE_NAME = {
  in: ['Приход', 'Receipt'], out: ['Списание', 'Write-off'], sale: ['Продажа', 'Sale'],
  return: ['Возврат', 'Return'], adjust: ['Инвентаризация', 'Stock count'],
};
export const SOURCE_NAME = {
  direct: ['Прямые заходы', 'Direct'], instagram: ['Instagram', 'Instagram'], google: ['Google', 'Google'],
  yandex: ['Яндекс', 'Yandex'], '2gis': ['2ГИС', '2GIS'], whatsapp: ['WhatsApp', 'WhatsApp'],
  telegram: ['Telegram', 'Telegram'], facebook: ['Facebook', 'Facebook'], tiktok: ['TikTok', 'TikTok'],
};

export const orderProfit = (o) => o.items.reduce((a, it) => a + (it.price - (it.cost || 0)) * it.qty, 0);
export const isSale = (o) => o.status !== 'canceled';

export function slug(s) {
  const map = { а: 'a', ә: 'a', б: 'b', в: 'v', г: 'g', ғ: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z', и: 'i', й: 'i', к: 'k', қ: 'q', л: 'l', м: 'm', н: 'n', ң: 'n', о: 'o', ө: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ұ: 'u', ү: 'u', ф: 'f', х: 'h', һ: 'h', ц: 'c', ч: 'ch', ш: 'sh', щ: 'sh', ы: 'y', і: 'i', э: 'e', ю: 'yu', я: 'ya' };
  return (s || '').toLowerCase().replace(/[«»"]/g, '').split('').map((c) => map[c] ?? c).join('').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 24) || 'item';
}

export const SKU_PREFIX = { sofas: 'SF', armchairs: 'AC', chairs: 'CH', tables: 'TB', beds: 'BD', storage: 'ST', light: 'LT', decor: 'DC' };

// ——— Идентификаторы посетителя для воронки (без cookies и личных данных)
const rid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
function stored(store, key, ttl) {
  try {
    const raw = JSON.parse(store.getItem(key) || 'null');
    if (raw && (!ttl || Date.now() - raw.t < ttl)) { raw.t = Date.now(); store.setItem(key, JSON.stringify(raw)); return [raw.id, false]; }
    const id = rid();
    store.setItem(key, JSON.stringify({ id, t: Date.now() }));
    return [id, true];
  } catch (e) { return [rid(), true]; }
}
// посетитель живёт в localStorage, визит — 30 минут бездействия
export const visitor = () => stored(localStorage, 'tor:vid', 0)[0];
export const session = () => stored(localStorage, 'tor:sid', 30 * 60e3);

export function trafficSource() {
  const u = new URLSearchParams(location.search);
  const utm = (u.get('utm_source') || '').toLowerCase().slice(0, 40);
  if (utm) return utm;
  let host = '';
  try { host = document.referrer ? new URL(document.referrer).hostname : ''; } catch (e) {}
  if (!host || host === location.hostname) return 'direct';
  for (const k of ['instagram', 'google', 'yandex', '2gis', 'whatsapp', 'telegram', 'facebook', 'tiktok']) if (host.includes(k) || (k === 'telegram' && host.includes('t.me'))) return k;
  return host.replace(/^www\./, '').slice(0, 40);
}

// Человеческие тексты для ошибок базы
export function humanError(err) {
  const m = String(err?.message || err || '');
  if (/phone_invalid/.test(m)) return L('Проверьте номер телефона', 'Please check the phone number');
  if (/name_required/.test(m)) return L('Укажите имя', 'Please enter a name');
  if (/address_required/.test(m)) return L('Укажите адрес доставки', 'Please enter a delivery address');
  if (/not_enough:([^:]+):(\d+)/.test(m)) { const [, , n] = m.match(/not_enough:([^:]+):(\d+)/); return L(`Столько нет на складе: осталось ${n} шт.`, `Not enough in stock: ${n} left`); }
  if (/unavailable/.test(m)) return L('Один из товаров больше недоступен', 'One of the items is no longer available');
  if (/forbidden|42501|permission/.test(m)) return L('Нет прав на это действие', 'You are not allowed to do this');
  if (/Invalid login credentials/i.test(m)) return L('Неверный email или пароль', 'Wrong email or password');
  if (/Email not confirmed/i.test(m)) return L('Подтвердите email по ссылке из письма', 'Confirm your email via the link we sent');
  if (/User already registered/i.test(m)) return L('Этот email уже зарегистрирован — войдите', 'This email is already registered — log in');
  if (/Password should be/i.test(m)) return L('Пароль слишком короткий: минимум 6 символов', 'Password is too short: at least 6 characters');
  if (/duplicate key.*sku/i.test(m)) return L('Такой артикул уже есть', 'This SKU already exists');
  if (/Failed to fetch|NetworkError|network/i.test(m)) return L('Нет связи с сервером. Проверьте интернет.', 'Cannot reach the server. Check your connection.');
  if (/storage.*full|quota/i.test(m)) return m;
  return m || L('Что-то пошло не так', 'Something went wrong');
}
