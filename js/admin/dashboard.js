// Обзор: главное на сегодня — выручка, конверсия, новые заказы, что заканчивается.
import * as db from '../db.js';
import { $, L, T, EN, esc, money, num, pct, fDate, ago, plural, pimg, catName, run, bars, hbars, delta, refresh } from './ui.js';
import { openOrderSheet, changeStatus, itemsLine } from './orders.js';

const dash = { period: 30 };

export function render(v) {
  const fresh = db.orders().filter((o) => o.status === 'new');
  const low = db.products().filter((p) => p.stock <= p.min).sort((a, b) => a.stock - a.min - (b.stock - b.min)).slice(0, 6);
  const name = db.me()?.name || '';
  const h = new Date().getHours();
  const hello = h < 12 ? L('Доброе утро', 'Good morning') : h < 18 ? L('Добрый день', 'Good afternoon') : L('Добрый вечер', 'Good evening');
  v.innerHTML = `
    <div class="page-head"><h1>${hello}${name && name !== 'Владелец' && name !== 'Демо' ? ', ' + esc(name) : ''}<small>${L('Продажи без учёта отменённых заказов', 'Sales excluding canceled orders')}</small></h1>
      <div class="tg" role="group" aria-label="${L('Период', 'Period')}">${[7, 30, 90].map((d) => `<button type="button" data-period="${d}" aria-pressed="${dash.period === d}">${d} ${L('дн.', 'd')}</button>`).join('')}</div></div>
    <div class="tiles" id="dtiles">${'<div class="tile skel-tile"></div>'.repeat(4)}</div>
    <div class="cols">
      <section class="panel"><div class="panel-head"><h2>${L('Выручка по дням', 'Revenue by day')}</h2><p>${L('Наведите на столбец', 'Hover a bar')}</p></div><div class="chart" id="chart"></div></section>
      <section class="panel"><div class="panel-head"><h2>${L('Новые заказы', 'New orders')} ${fresh.length ? `<span class="pill acc plain">${fresh.length}</span>` : ''}</h2><a class="b sm" href="#/orders">${L('Все заказы', 'All orders')}</a></div>
        ${fresh.length ? `<ul class="alist">${fresh.slice(0, 5).map((o) => `<li data-order="${o.id}" class="clickable"><span class="pill acc plain al-no">${o.no}</span><div><p class="al-name">${esc(o.name)} · ${money(o.total)}</p><p class="al-sub">${ago(o.ts)} · ${itemsLine(o)}</p></div><button class="b sm pri" type="button" data-confirm="${o.id}"><i class="ph ph-check"></i>${L('Подтвердить', 'Confirm')}</button></li>`).join('')}</ul>${fresh.length > 5 ? `<a class="more-link" href="#/orders">${L(`Ещё ${fresh.length - 5}`, `${fresh.length - 5} more`)} →</a>` : ''}`
          : `<p class="empty-note"><i class="ph-fill ph-check-circle"></i>${L('Все новые заказы обработаны', 'All new orders handled')}</p>`}
      </section>
    </div>
    <div class="cols even">
      <section class="panel"><div class="panel-head"><h2>${L('Воронка сайта', 'Website funnel')}</h2><a class="b sm" href="#/analytics">${L('Аналитика', 'Analytics')}</a></div><div id="dfunnel"></div></section>
      <section class="panel"><div class="panel-head"><h2>${L('Заканчивается на складе', 'Running low')}</h2><a class="b sm" href="#/stock">${L('Склад', 'Stock')}</a></div>
        ${low.length ? `<ul class="alist">${low.map((p) => `<li><img src="${pimg(p)}" alt=""><div><p class="al-name">${esc(T(p.name))}</p><p class="al-sub">${p.stock <= 0 ? L(`Нет в наличии${p.stock < 0 ? `, должны клиентам ${-p.stock}` : ''}`, `Out of stock${p.stock < 0 ? `, owed ${-p.stock}` : ''}`) : L(`Осталось ${p.stock}, порог ${p.min}`, `${p.stock} left, threshold ${p.min}`)}</p></div><button class="b sm" type="button" data-receive="${p.id}"><i class="ph ph-plus"></i>${L('Приход', 'Receive')}</button></li>`).join('')}</ul>`
          : `<p class="empty-note"><i class="ph-fill ph-check-circle"></i>${L('Всего хватает', 'Everything is stocked')}</p>`}</section>
    </div>
    <div class="cols even">
      <section class="panel"><div class="panel-head"><h2>${L('Лидеры продаж', 'Top sellers')}</h2><p>${L('по выручке', 'by revenue')}</p></div><div id="dtop"></div></section>
      <section class="panel"><div class="panel-head"><h2>${L('Продажи по категориям', 'Sales by category')}</h2><p>${L('доля выручки', 'share of revenue')}</p></div><div id="dcats"></div></section>
    </div>`;
  v.onclick = async (e) => {
    const b = e.target.closest('button, li[data-order]');
    if (!b) return;
    if (b.dataset.period) { dash.period = +b.dataset.period; return refresh(); }
    if (b.dataset.confirm) { e.stopPropagation(); return changeStatus(b.dataset.confirm, 'confirmed', b); }
    if (b.dataset.order) openOrderSheet(b.dataset.order);
  };
  fill(v);
}

async function fill(v) {
  const r = await run(() => db.dashboard(dash.period));
  if (!r.ok || !v.isConnected) return;
  const d = r.value, t = d.totals;
  const conv = pct(d.funnel.order, d.funnel.visit);
  $('#dtiles', v).innerHTML = `
    <div class="tile"><span class="tile-label"><i class="ph ph-currency-circle-dollar"></i>${L('Выручка', 'Revenue')}</span><span class="tile-value">${money(t.rev)}</span><span class="tile-sub">${delta(t.rev, t.prevRev, t.prevOrders >= 3 && t.prevRev > t.rev * 0.25) || L(`за ${dash.period} дн.`, `last ${dash.period} days`)}</span></div>
    <div class="tile"><span class="tile-label"><i class="ph ph-receipt"></i>${L('Заказы', 'Orders')}</span><span class="tile-value">${t.orders}</span><span class="tile-sub">${L('Средний чек', 'Avg. order')} ${money(t.orders ? t.rev / t.orders : 0)}${t.canceled ? ` · ${L('отмен', 'canceled')} ${t.canceled}` : ''}</span></div>
    <div class="tile"><span class="tile-label"><i class="ph ph-funnel"></i>${L('Конверсия сайта', 'Site conversion')}</span><span class="tile-value">${String(conv).replace('.', EN ? '.' : ',')}%</span><span class="tile-sub">${num(t.visits)} ${L(plural(t.visits, 'визит', 'визита', 'визитов'), 'visits')} → ${d.funnel.order} ${L(plural(d.funnel.order, 'заказ', 'заказа', 'заказов'), 'orders')}</span></div>
    <div class="tile"><span class="tile-label"><i class="ph ph-trend-up"></i>${L('Валовая прибыль', 'Gross profit')}</span><span class="tile-value">${money(t.profit)}</span><span class="tile-sub">${L('Маржа', 'Margin')} ${t.goods ? Math.round((t.profit / t.goods) * 100) : 0}%</span></div>`;
  const days = d.days.map((x) => ({ ...x, ts: Date.parse(x.d + 'T12:00:00') }));
  bars($('#chart', v), days, {
    value: (x) => x.rev, label: (x) => fDate(x.ts).replace('.', ''), aria: L('Выручка по дням', 'Revenue by day'),
    tip: (x) => `${fDate(x.ts)}<br><b>${money(x.rev)}</b><br>${x.orders} ${L(plural(x.orders, 'заказ', 'заказа', 'заказов'), x.orders === 1 ? 'order' : 'orders')}`,
  });
  $('#dfunnel', v).innerHTML = funnelHtml(d.funnel, true);
  const top = d.products.filter((x) => x.rev > 0).slice(0, 6);
  $('#dtop', v).innerHTML = hbars(top, { name: (x) => `${esc(T(x.name) || x.pid)} <span class="muted">· ${num(x.qty)} ${L('шт.', 'pcs')}</span>`, value: (x) => x.rev, sub: (x) => money(x.rev), empty: L('Нет продаж за период', 'No sales in this period') });
  $('#dcats', v).innerHTML = hbars(d.cats, { name: (x) => esc(x.cat === '_' ? L('Удалённые товары', 'Deleted products') : catName(x.cat)), value: (x) => x.rev, sub: (x) => `${money(x.rev)} · ${t.goods ? Math.round((x.rev / t.goods) * 100) : 0}%`, empty: L('Нет продаж за период', 'No sales in this period') });
}

// Воронка: доля сессий, дошедших до шага, и конверсия из предыдущего шага
export function funnelHtml(f, compactView) {
  const steps = [
    ['visit', L('Зашли на сайт', 'Visited'), 'ph-door-open'],
    ['product', L('Открыли товар', 'Viewed a product'), 'ph-eye'],
    ['cart', L('Положили в корзину', 'Added to bag'), 'ph-bag-simple'],
    ['checkout', L('Начали оформление', 'Started checkout'), 'ph-clipboard-text'],
    ['order', L('Оформили заказ', 'Placed an order'), 'ph-check-circle'],
  ];
  const top = Math.max(1, f.visit);
  if (!f.visit && !f.order) return `<p class="empty-note">${L('Данные появятся, когда на сайт начнут заходить посетители', 'Data appears once people visit the site')}</p>`;
  return `<ol class="funnel ${compactView ? 'compact' : ''}">${steps.map(([k, n, ic], i) => {
    const v = f[k] || 0, prev = i ? f[steps[i - 1][0]] || 0 : v;
    return `<li><span class="fn-name"><i class="ph ${ic}"></i>${n}</span><span class="fn-val"><b>${num(v)}</b> <span class="muted">${String(pct(v, top)).replace('.', EN ? '.' : ',')}%</span></span>
      <span class="fn-track"><i style="--w:${(v / top) * 100}%"></i></span>${i ? `<span class="fn-step">${L('из пред. шага', 'from prev. step')} ${prev ? Math.round((v / prev) * 100) : 0}%</span>` : ''}</li>`;
  }).join('')}</ol>`;
}
