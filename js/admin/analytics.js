// Аналитика: посещаемость, воронка, источники трафика, товары — что смотрят и что покупают.
import * as db from '../db.js';
import { $, L, T, EN, esc, money, num, pct, fDate, plural, pimg, sourceName, run, bars, delta, refresh, download, csv, stamp } from './ui.js';
import { funnelHtml } from './dashboard.js';

const an = { period: 30, sort: 'views' };
let last = null;

export function render(v) {
  v.innerHTML = `
    <div class="page-head"><h1>${L('Аналитика', 'Analytics')}<small>${L('Визит — один заход на сайт; новый визит начинается после 30 минут бездействия', 'A visit is one session; a new one starts after 30 idle minutes')}</small></h1>
      <div class="tg" role="group" aria-label="${L('Период', 'Period')}">${[7, 30, 90].map((d) => `<button type="button" data-period="${d}" aria-pressed="${an.period === d}">${d} ${L('дн.', 'd')}</button>`).join('')}</div>
      <button class="b" type="button" data-act="export-an"><i class="ph ph-download-simple"></i><span>CSV</span></button></div>
    <div class="tiles" id="atiles">${'<div class="tile skel-tile"></div>'.repeat(4)}</div>
    <div class="cols">
      <section class="panel"><div class="panel-head"><h2>${L('Воронка продаж', 'Sales funnel')}</h2><p>${L('сессии, дошедшие до шага', 'sessions reaching each step')}</p></div><div id="afunnel"></div></section>
      <section class="panel"><div class="panel-head"><h2>${L('Источники трафика', 'Traffic sources')}</h2><p>${L('визиты → заказы', 'visits → orders')}</p></div><div id="asources"></div></section>
    </div>
    <div class="cols even">
      <section class="panel"><div class="panel-head"><h2>${L('Визиты по дням', 'Visits by day')}</h2></div><div class="chart" id="avisits"></div></section>
      <section class="panel"><div class="panel-head"><h2>${L('Заказы по дням', 'Orders by day')}</h2></div><div class="chart" id="aorders"></div></section>
    </div>
    <section class="panel"><div class="panel-head"><h2>${L('Товары: интерес и продажи', 'Products: interest vs sales')}</h2><p>${L('Много просмотров и мало продаж — повод проверить цену, фото или описание', 'Many views but few sales? Check the price, photos or copy')}</p></div><div id="aprod"></div></section>`;
  v.onclick = (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.period) { an.period = +b.dataset.period; return refresh(); }
    if (b.dataset.asort) { an.sort = b.dataset.asort; return last && renderProducts(v, last); }
    if (b.dataset.act === 'export-an' && last) exportCsv(last);
  };
  fill(v);
}

async function fill(v) {
  const r = await run(() => db.dashboard(an.period));
  if (!r.ok || !v.isConnected) return;
  const d = (last = r.value), t = d.totals, f = d.funnel;
  const conv = pct(f.order, f.visit);
  const cartConv = pct(f.order, f.cart);
  $('#atiles', v).innerHTML = `
    <div class="tile"><span class="tile-label"><i class="ph ph-users"></i>${L('Визиты', 'Visits')}</span><span class="tile-value">${num(t.visits)}</span><span class="tile-sub">${delta(t.visits, t.prevVisits, t.prevVisits >= 20 && t.prevVisits > t.visits * 0.25) || `${num(t.visitors)} ${L(plural(t.visitors, 'посетитель', 'посетителя', 'посетителей'), 'visitors')}`}</span></div>
    <div class="tile"><span class="tile-label"><i class="ph ph-funnel"></i>${L('Конверсия в заказ', 'Conversion rate')}</span><span class="tile-value">${fmtPct(conv)}%</span><span class="tile-sub">${L('из визита в оформленный заказ', 'visit → placed order')}</span></div>
    <div class="tile"><span class="tile-label"><i class="ph ph-bag-simple"></i>${L('Корзина → заказ', 'Bag → order')}</span><span class="tile-value">${fmtPct(cartConv)}%</span><span class="tile-sub">${L('брошенных корзин', 'abandoned bags')}: ${Math.max(0, f.cart - f.order)}</span></div>
    <div class="tile"><span class="tile-label"><i class="ph ph-receipt"></i>${L('Средний чек', 'Average order')}</span><span class="tile-value">${money(t.orders ? t.rev / t.orders : 0)}</span><span class="tile-sub">${t.orders} ${L(plural(t.orders, 'заказ', 'заказа', 'заказов'), 'orders')} · ${money(t.rev)}</span></div>`;
  $('#afunnel', v).innerHTML = funnelHtml(f);
  $('#asources', v).innerHTML = d.sources.length ? `<table class="tbl mini"><thead><tr><th>${L('Источник', 'Source')}</th><th class="n">${L('Визиты', 'Visits')}</th><th class="n">${L('Заказы', 'Orders')}</th><th class="n">${L('Конв.', 'Conv.')}</th></tr></thead><tbody>
    ${d.sources.map((s) => `<tr><td>${esc(sourceName(s.source))}</td><td class="n">${num(s.visits)}</td><td class="n">${num(s.orders)}</td><td class="n">${fmtPct(pct(s.orders, s.visits))}%</td></tr>`).join('')}</tbody></table>
    <p class="muted hint-sm">${L('Метки: добавляйте ?utm_source=instagram к ссылкам в рекламе и соцсетях — источник определится точно.', 'Tip: add ?utm_source=instagram to links in ads and social posts for exact attribution.')}</p>`
    : `<p class="empty-note">${L('Пока нет визитов', 'No visits yet')}</p>`;
  const days = d.days.map((x) => ({ ...x, ts: Date.parse(x.d + 'T12:00:00') }));
  const lbl = (x) => fDate(x.ts).replace('.', '');
  bars($('#avisits', v), days, { value: (x) => x.visits, label: lbl, fmt: (n) => num(n), aria: L('Визиты по дням', 'Visits by day'), tip: (x) => `${fDate(x.ts)}<br><b>${num(x.visits)}</b> ${L('визитов', 'visits')}<br>${L('конверсия', 'conversion')} ${fmtPct(pct(x.orders, x.visits))}%` });
  bars($('#aorders', v), days, { value: (x) => x.orders, label: lbl, fmt: (n) => num(n), aria: L('Заказы по дням', 'Orders by day'), tip: (x) => `${fDate(x.ts)}<br><b>${x.orders}</b> ${L(plural(x.orders, 'заказ', 'заказа', 'заказов'), 'orders')}<br>${money(x.rev)}` });
  renderProducts(v, d);
}

const fmtPct = (x) => String(x).replace('.', EN ? '.' : ',');

function renderProducts(v, d) {
  const rows = d.products.filter((x) => x.views || x.qty).map((x) => ({ ...x, p: db.product(x.pid), conv: x.views ? (x.qty ? Math.min(100, Math.round((x.qty / x.views) * 1000) / 10) : 0) : null }));
  const key = { views: (x) => x.views, carts: (x) => x.carts, qty: (x) => x.qty, rev: (x) => x.rev, conv: (x) => x.conv ?? -1 }[an.sort];
  rows.sort((a, b) => key(b) - key(a));
  const th = (k, n) => `<th class="n"><button type="button" data-asort="${k}">${n}${an.sort === k ? ' <i class="ph ph-caret-down"></i>' : ''}</button></th>`;
  $('#aprod', v).innerHTML = rows.length ? `<div class="tbl-scroll"><table class="tbl mini"><thead><tr><th>${L('Товар', 'Product')}</th>${th('views', L('Просмотры', 'Views'))}${th('carts', L('В корзину', 'Bagged'))}${th('qty', L('Продано', 'Sold'))}${th('conv', L('Просм.→покупка', 'View→buy'))}${th('rev', L('Выручка', 'Revenue'))}</tr></thead><tbody>
    ${rows.slice(0, 40).map((x) => `<tr><td><div class="prod-cell"><img src="${pimg(x.p)}" alt="" loading="lazy"><b>${esc(T(x.name || x.p?.name) || x.pid)}</b></div></td><td class="n">${num(x.views)}</td><td class="n">${num(x.carts)}</td><td class="n">${num(x.qty)}</td>
      <td class="n">${x.conv == null ? '—' : `<span class="${x.views >= 10 && x.conv < 2 ? 'qty-minus' : ''}">${fmtPct(x.conv)}%</span>`}</td><td class="n">${money(x.rev)}</td></tr>`).join('')}</tbody></table></div>`
    : `<p class="empty-note">${L('Пока нет данных', 'No data yet')}</p>`;
}

function exportCsv(d) {
  const rows = [[L('Дата', 'Date'), L('Визиты', 'Visits'), L('Заказы', 'Orders'), L('Выручка', 'Revenue'), L('Конверсия, %', 'Conversion, %')]];
  d.days.forEach((x) => rows.push([x.d, x.visits, x.orders, x.rev, pct(x.orders, x.visits)]));
  download(`tor-analytics-${stamp()}.csv`, csv(rows), 'text/csv');
}
