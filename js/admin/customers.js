// Клиенты: база покупателей, собранная из заказов (по номеру телефона).
import * as db from '../db.js';
import { $, L, esc, money, num, fDate, ago, plural, digits, sheet, sheetHead, statusPill, download, csv, stamp } from './ui.js';
import { openOrderSheet, itemsLine } from './orders.js';

const cu = { q: '', sort: 'sum', limit: 100 };

export function customers() {
  const map = new Map();
  for (const o of db.orders()) {
    const key = digits(o.phone) || 'name:' + o.name.toLowerCase();
    const c = map.get(key) || { key, name: o.name, phone: o.phone, orders: [], sum: 0, count: 0, last: 0, first: Infinity };
    c.orders.push(o);
    if (o.status !== 'canceled') { c.sum += o.total; c.count++; }
    if (o.ts > c.last) { c.last = o.ts; c.name = o.name; c.address = o.address || c.address; }
    c.first = Math.min(c.first, o.ts);
    map.set(key, c);
  }
  return [...map.values()];
}

export function render(v) {
  const all = customers();
  const repeat = all.filter((c) => c.count > 1).length;
  const ltv = all.length ? all.reduce((s, c) => s + c.sum, 0) / all.length : 0;
  v.innerHTML = `
    <div class="page-head"><h1>${L('Клиенты', 'Customers')}<small>${L('Собираются из заказов автоматически, по номеру телефона', 'Built from orders automatically, by phone number')}</small></h1>
      <button class="b" type="button" data-act="export-cust"><i class="ph ph-download-simple"></i><span>CSV</span></button></div>
    <div class="tiles">
      <div class="tile"><span class="tile-label"><i class="ph ph-users-three"></i>${L('Клиентов', 'Customers')}</span><span class="tile-value">${num(all.length)}</span><span class="tile-sub">${L('за всё время', 'all time')}</span></div>
      <div class="tile"><span class="tile-label"><i class="ph ph-arrows-clockwise"></i>${L('Купили повторно', 'Repeat buyers')}</span><span class="tile-value">${num(repeat)}</span><span class="tile-sub">${all.length ? Math.round((repeat / all.length) * 100) : 0}% ${L('от всех', 'of all')}</span></div>
      <div class="tile"><span class="tile-label"><i class="ph ph-wallet"></i>${L('Средняя сумма покупок', 'Avg. lifetime value')}</span><span class="tile-value">${money(ltv)}</span><span class="tile-sub">${L('на одного клиента', 'per customer')}</span></div>
      <div class="tile"><span class="tile-label"><i class="ph ph-user-plus"></i>${L('Новых за 30 дней', 'New in 30 days')}</span><span class="tile-value">${num(all.filter((c) => c.first > Date.now() - 30 * db.DAY_MS).length)}</span><span class="tile-sub">${L('первый заказ', 'first order')}</span></div>
    </div>
    <div class="toolbar-a">
      <label class="search-in"><i class="ph ph-magnifying-glass"></i><input class="in" type="search" id="cq" value="${esc(cu.q)}" placeholder="${L('Имя или телефон', 'Name or phone')}" aria-label="${L('Поиск', 'Search')}"></label>
      <select class="sel" id="csort" aria-label="${L('Сортировка', 'Sort')}">${[['sum', L('По сумме покупок', 'By total spent')], ['count', L('По числу заказов', 'By order count')], ['last', L('Недавние', 'Most recent')]].map(([k, n]) => `<option value="${k}" ${cu.sort === k ? 'selected' : ''}>${n}</option>`).join('')}</select>
    </div>
    <div id="ctable"></div>`;
  renderTable();
  $('#cq', v).addEventListener('input', (e) => { cu.q = e.target.value; renderTable(); });
  $('#csort', v).addEventListener('change', (e) => { cu.sort = e.target.value; renderTable(); });
  v.onclick = (e) => {
    const t = e.target.closest('button, tr[data-cust]');
    if (!t) return;
    if (t.dataset.act === 'export-cust') return exportCsv();
    if (t.dataset.act === 'more-cust') { cu.limit += 200; return renderTable(); }
    if (t.dataset.cust) openCustomer(t.dataset.cust);
  };
}

function renderTable() {
  const box = $('#ctable');
  if (!box) return;
  const q = cu.q.trim().toLowerCase(), qd = digits(q);
  const list = customers().filter((c) => !q || c.name.toLowerCase().includes(q) || (qd.length > 2 && digits(c.phone).includes(qd)))
    .sort((a, b) => b[cu.sort] - a[cu.sort]);
  box.innerHTML = list.length ? `<div class="tbl-wrap"><table class="tbl tbl-cards"><thead><tr><th>${L('Клиент', 'Customer')}</th><th class="n">${L('Заказов', 'Orders')}</th><th class="n">${L('Сумма', 'Spent')}</th><th class="n hide-md">${L('Средний чек', 'Avg.')}</th><th>${L('Последний заказ', 'Last order')}</th></tr></thead><tbody>
    ${list.slice(0, cu.limit).map((c) => `<tr class="clickable" data-cust="${esc(c.key)}"><td class="m-r1c12"><b style="font-weight:500">${esc(c.name)}</b> ${c.count > 1 ? `<span class="pill acc plain">${L('постоянный', 'repeat')}</span>` : ''}<br><span class="muted tnum">${esc(c.phone || '—')}</span></td>
      <td class="n m-r2c1">${c.count}</td><td class="n m-r1c3"><b style="font-weight:500">${money(c.sum)}</b></td><td class="n hide-md m-hide">${money(c.count ? c.sum / c.count : 0)}</td><td class="muted m-r2c23">${ago(c.last)}</td></tr>`).join('')}
    </tbody></table>${list.length > cu.limit ? `<div class="more"><button class="b" type="button" data-act="more-cust">${L('Показать ещё', 'Show more')}</button></div>` : ''}</div>`
    : `<div class="panel"><p class="empty-note">${L('Клиентов пока нет — они появятся с первым заказом', 'No customers yet — they appear with the first order')}</p></div>`;
}

function openCustomer(key) {
  const c = customers().find((x) => x.key === key);
  if (!c) return;
  const wa = digits(c.phone) ? `https://wa.me/${digits(c.phone)}` : '';
  const d = sheet(sheetHead(esc(c.name), `${c.count} ${L(plural(c.count, 'заказ', 'заказа', 'заказов'), c.count === 1 ? 'order' : 'orders')} · ${money(c.sum)}`) + `
    <div class="sh-body">
      ${c.phone ? `<div class="quick-acts"><a class="b" href="tel:${esc(c.phone.replace(/\s/g, ''))}"><i class="ph ph-phone"></i>${esc(c.phone)}</a>${wa ? `<a class="b" href="${wa}" target="_blank" rel="noopener"><i class="ph ph-whatsapp-logo"></i>WhatsApp</a>` : ''}</div>` : ''}
      <section class="sec"><h3>${L('Сводка', 'Summary')}</h3><dl class="kv"><dt>${L('Первый заказ', 'First order')}</dt><dd>${fDate(c.first)}</dd><dt>${L('Последний', 'Latest')}</dt><dd>${ago(c.last)}</dd><dt>${L('Средний чек', 'Average order')}</dt><dd>${money(c.count ? c.sum / c.count : 0)}</dd>${c.address ? `<dt>${L('Адрес', 'Address')}</dt><dd>${esc(c.address)}</dd>` : ''}</dl></section>
      <section class="sec"><h3>${L('Заказы', 'Orders')}</h3><ul class="alist">${c.orders.map((o) => `<li class="clickable" data-o="${o.id}"><span class="pill plain al-no">${o.no}</span><div><p class="al-name">${money(o.total)} · ${ago(o.ts)}</p><p class="al-sub">${itemsLine(o)}</p></div>${statusPill(o.status)}</li>`).join('')}</ul></section>
    </div>`, { narrow: true });
  d.addEventListener('click', (e) => { const li = e.target.closest('[data-o]'); if (li) openOrderSheet(li.dataset.o); });
}

function exportCsv() {
  const rows = [[L('Имя', 'Name'), L('Телефон', 'Phone'), L('Заказов', 'Orders'), L('Сумма', 'Spent'), L('Первый заказ', 'First order'), L('Последний заказ', 'Last order')]];
  customers().forEach((c) => rows.push([c.name, c.phone, c.count, c.sum, new Date(c.first).toLocaleDateString(), new Date(c.last).toLocaleDateString()]));
  download(`tor-customers-${stamp()}.csv`, csv(rows), 'text/csv');
}
