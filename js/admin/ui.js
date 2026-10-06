// Общие кирпичики панели: тосты, диалоги, боковые панели, форматирование, графики.
import * as db from '../db.js';

export const { L, T, EN, money, num, esc, asset, thumb } = db;
export const $ = (s, el = document) => el.querySelector(s);
export const $$ = (s, el = document) => [...el.querySelectorAll(s)];
export const DAY = db.DAY_MS;

// Перерисовка текущего раздела — функцию подставляет main.js
let refreshFn = () => {};
export const setRefresh = (fn) => (refreshFn = fn);
export const refresh = () => refreshFn();

// ——— Форматирование
const dateFmt = new Intl.DateTimeFormat(EN ? 'en-GB' : 'ru-RU', { day: 'numeric', month: 'short' });
const timeFmt = new Intl.DateTimeFormat(EN ? 'en-GB' : 'ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
const clockFmt = new Intl.DateTimeFormat(EN ? 'en-GB' : 'ru-RU', { hour: '2-digit', minute: '2-digit' });
export const compact = new Intl.NumberFormat(EN ? 'en-US' : 'ru-RU', { notation: 'compact', maximumFractionDigits: 1 });
export const fDate = (ts) => dateFmt.format(ts);
export const fTime = (ts) => timeFmt.format(ts);
export const fClock = (ts) => clockFmt.format(ts);
export const startOfDay = (ts) => { const d = new Date(ts); d.setHours(0, 0, 0, 0); return d.getTime(); };
export const plural = (n, a, b, c) => (EN ? (n === 1 ? a : b) : n % 10 === 1 && n % 100 !== 11 ? a : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20) ? b : c);
export const pcs = (n) => num(n) + L(' шт.', ' pcs');
export const pct = (a, b) => (b ? Math.round((a / b) * 1000) / 10 : 0);
export const catName = (id) => T(db.category(id)?.name) || L('Без категории', 'Uncategorised');
export const statusName = (s) => T(db.STATUS_NAME[s]);
export const sourceName = (s) => T(db.SOURCE_NAME[s]) || s;
export const pimg = (p) => thumb(p?.imgs?.[0]);
export const digits = (s) => String(s || '').replace(/\D/g, '');

export function ago(ts) {
  const m = Math.round((Date.now() - ts) / 6e4);
  if (m < 1) return L('только что', 'just now');
  if (m < 60) return L(`${m} мин назад`, `${m} min ago`);
  const h = Math.round(m / 60);
  if (h < 24 && startOfDay(ts) === startOfDay(Date.now())) return L(`сегодня в ${fClock(ts)}`, `today at ${fClock(ts)}`);
  if (startOfDay(ts) === startOfDay(Date.now() - DAY)) return L(`вчера в ${fClock(ts)}`, `yesterday at ${fClock(ts)}`);
  return fTime(ts);
}

export function stockPill(p) {
  if (p.stock < 0) return `<span class="pill bad">${L('Долг', 'Owed')} ${-p.stock}</span>`;
  if (p.stock === 0) return `<span class="pill bad">${L('Нет', 'Out')}</span>`;
  if (p.stock <= p.min) return `<span class="pill warn">${p.stock}</span>`;
  return `<span class="pill ok">${p.stock}</span>`;
}
export const statusPill = (s) => `<span class="pill st-${s}">${statusName(s)}</span>`;

// ——— Тост
let toastTimer;
export function toast(msg, action, fn, ms) {
  let t = $('#toast');
  if (!t) { t = document.createElement('div'); t.id = 'toast'; t.className = 'toast'; t.setAttribute('role', 'status'); document.body.append(t); }
  t.innerHTML = `<span>${esc(msg)}</span>` + (action ? `<button type="button">${esc(action)}</button>` : '');
  t.hidden = false; t.style.animation = 'none'; void t.offsetWidth; t.style.animation = '';
  if (action) t.querySelector('button').onclick = () => { t.hidden = true; fn(); };
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (t.hidden = true), ms || (action ? 6500 : 3200));
}

// Выполнить действие с базой: блокируем кнопку, ошибки показываем по-человечески
export async function run(fn, btn) {
  const b = btn && btn.tagName ? btn : null;
  if (b) { b.disabled = true; b.classList.add('is-busy'); }
  try { return { ok: true, value: await fn() }; }
  catch (err) { console.error(err); toast(db.humanError(err)); return { ok: false, error: err }; }
  finally { if (b) { b.disabled = false; b.classList.remove('is-busy'); } }
}

// ——— Подтверждение
export function confirmBox({ title, text = '', ok = L('Удалить', 'Delete'), danger = true, extra = '' }) {
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

// ——— Боковая панель (редакторы, карточки заказов)
export function sheet(html, { narrow = false, id = '' } = {}) {
  $$('dialog.sheet').forEach((s) => s.close());
  const d = document.createElement('dialog');
  d.className = 'sheet' + (narrow ? ' narrow' : '');
  if (id) d.dataset.id = id;
  d.innerHTML = html;
  document.body.append(d);
  d.showModal();
  d.addEventListener('click', (e) => { if (e.target === d || e.target.closest('[data-close]')) d.close(); });
  d.addEventListener('close', () => setTimeout(() => d.remove(), 50));
  return d;
}
export const sheetHead = (title, sub = '', extra = '') => `<div class="sh-head"><h2>${title}${sub ? `<small>${sub}</small>` : ''}</h2>${extra}<button class="b ghost icon" type="button" data-close aria-label="${L('Закрыть', 'Close')}"><i class="ph ph-x"></i></button></div>`;

// ——— Файлы
export function download(name, text, type = 'text/plain') {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type }));
  a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
export const csv = (rows) => '﻿' + rows.map((r) => r.map((v) => { const s = String(v ?? ''); return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; }).join(';')).join('\n');
export const stamp = () => new Date().toISOString().slice(0, 10);

// ——— Графики: столбцы с подсказкой (одна серия, одна ось)
export function niceMax(v) {
  if (v <= 0) return 1;
  const e = Math.pow(10, Math.floor(Math.log10(v)));
  const f = v / e;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * e;
}

const charts = new WeakMap();
export function bars(el, data, { value, tip, label, height = 220, fmt = (v) => compact.format(v), aria = '' }) {
  const draw = () => {
    const W = el.clientWidth || 600;
    const H = matchMedia('(max-width: 520px)').matches ? Math.min(height, 190) : height;
    const pl = 46, pr = 4, pt = 10, pb = 24;
    const pw = W - pl - pr, ph = H - pt - pb;
    const max = niceMax(Math.max(1, ...data.map(value)) * 1.05);
    const band = pw / data.length;
    const bw = Math.min(24, band * 0.66);
    const y = (v) => pt + ph - (v / max) * ph;
    const every = data.length > 45 ? (W < 500 ? 21 : 10) : data.length > 14 ? (W < 500 ? 7 : 5) : 1;
    let s = `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="${esc(aria)}">`;
    s += [0, 0.5, 1].map((k) => k * max).map((t) => `<line class="grid-l" x1="${pl}" x2="${W - pr}" y1="${y(t)}" y2="${y(t)}"/><text class="axis-t" x="${pl - 8}" y="${y(t) + 4}" text-anchor="end">${t ? fmt(t) : '0'}</text>`).join('');
    data.forEach((d, i) => {
      const cx = pl + band * i + band / 2;
      const h = Math.max(0, ph - (y(value(d)) - pt));
      if (h > 0) {
        const r = Math.min(4, h, bw / 2), x0 = cx - bw / 2, yb = pt + ph, yt = yb - h;
        s += `<path class="bar" data-i="${i}" d="M${x0},${yb}V${yt + r}Q${x0},${yt} ${x0 + r},${yt}H${x0 + bw - r}Q${x0 + bw},${yt} ${x0 + bw},${yt + r}V${yb}Z"/>`;
      }
      if ((data.length - 1 - i) % every === 0) s += `<text class="axis-t" x="${cx}" y="${H - 6}" text-anchor="middle">${esc(label(d))}</text>`;
      s += `<rect class="hit" data-i="${i}" x="${pl + band * i}" y="${pt}" width="${band}" height="${ph}"/>`;
    });
    s += '</svg><div class="chart-tip" hidden></div>';
    el.innerHTML = s;
    const tp = $('.chart-tip', el);
    el.onpointermove = (e) => {
      const hit = e.target.closest('.hit');
      if (!hit) return;
      const i = +hit.dataset.i, d = data[i];
      $$('.bar', el).forEach((b) => b.classList.toggle('dim', +b.dataset.i !== i));
      tp.innerHTML = tip(d); tp.hidden = false;
      tp.style.left = Math.min(Math.max(pl + band * i + band / 2, 70), W - 70) + 'px';
      tp.style.top = Math.min(y(value(d)), pt + ph - 10) + 'px';
    };
    el.onpointerleave = () => { tp.hidden = true; $$('.bar', el).forEach((b) => b.classList.remove('dim')); };
  };
  draw();
  charts.get(el)?.disconnect();
  const ro = new ResizeObserver(() => draw());
  ro.observe(el); charts.set(el, ro);
}

export const hbars = (rows, { name, value, sub = () => '', empty }) => {
  const max = Math.max(1, ...rows.map(value));
  return rows.length ? `<ul class="hbars">${rows.map((r) => `<li><span class="hb-name">${name(r)}</span><span class="hb-val">${sub(r)}</span><span class="hb-track"><i style="--w:${(value(r) / max) * 100}%"></i></span></li>`).join('')}</ul>` : `<p class="empty-note">${empty || L('Пока нет данных', 'No data yet')}</p>`;
};

export const delta = (a, b, enough = true) => {
  if (!b || !enough) return '';
  const d = Math.round(((a - b) / b) * 100);
  return `<span class="delta ${d >= 0 ? 'up' : 'down'}">${d >= 0 ? '↑' : '↓'} ${Math.abs(d)}%</span> ${L('к прошлому периоду', 'vs previous period')}`;
};

// ——— Звук и системные уведомления о новых заказах
let actx;
export function chime() {
  try { if (localStorage.getItem('tor:sound') === 'off') return; } catch (e) {}
  try {
    actx ||= new (window.AudioContext || window.webkitAudioContext)();
    const t = actx.currentTime;
    [660, 880].forEach((f, i) => {
      const o = actx.createOscillator(), g = actx.createGain();
      o.frequency.value = f; o.type = 'sine';
      g.gain.setValueAtTime(0.0001, t + i * 0.16); g.gain.exponentialRampToValueAtTime(0.18, t + i * 0.16 + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + i * 0.16 + 0.35);
      o.connect(g).connect(actx.destination); o.start(t + i * 0.16); o.stop(t + i * 0.16 + 0.4);
    });
  } catch (e) {}
}
