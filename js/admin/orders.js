// Заказы: список и доска по статусам, карточка заказа, продажа в шоуруме.
import * as db from '../db.js';
import { $, $$, L, T, EN, esc, money, num, DAY, fTime, ago, plural, statusName, statusPill, pimg, digits, toast, run, confirmBox, sheet, sheetHead, download, csv, stamp, startOfDay, refresh } from './ui.js';

export const STATUS_TAB = { new: ['Новые', 'New'], confirmed: ['Подтверждены', 'Confirmed'], delivering: ['В доставке', 'Delivering'], done: ['Выполнены', 'Completed'], canceled: ['Отменены', 'Canceled'] };
const NEXT = {
  new: ['confirmed', ['Подтвердить', 'Confirm'], 'ph-check'],
  confirmed: ['delivering', ['Передать в доставку', 'Send for delivery'], 'ph-truck'],
  delivering: ['done', ['Выполнен', 'Mark completed'], 'ph-check-circle'],
};
const savedView = () => { try { return localStorage.getItem('tor:ordersView') || 'board'; } catch (e) { return 'board'; } };
const or = { status: 'all', q: '', period: 'all', source: 'all', limit: 80, view: savedView(), showCanceled: false };

export function openFiltered(status) { or.status = status; or.view = 'list'; }

function filtered({ ignoreStatus = false } = {}) {
  const q = or.q.trim().toLowerCase().replace(/^№/, '');
  const qd = digits(q);
  const since = or.period === 'today' ? startOfDay(Date.now()) : or.period === '7' ? Date.now() - 7 * DAY : or.period === '30' ? Date.now() - 30 * DAY : 0;
  return db.orders().filter((o) => {
    if (!ignoreStatus && or.status !== 'all' && o.status !== or.status) return false;
    if (since && o.ts < since) return false;
    if (or.source !== 'all' && o.source !== or.source) return false;
    if (q && !(String(o.no).includes(q) || o.name.toLowerCase().includes(q) || (qd.length > 2 && digits(o.phone).includes(qd)) || o.items.some((it) => T(it.name).toLowerCase().includes(q)))) return false;
    return true;
  });
}

const itemsLine = (o) => `${esc(T(o.items[0]?.name))}${o.items[0]?.qty > 1 ? ' ×' + o.items[0].qty : ''}${o.items.length > 1 ? L(` и ещё ${o.items.length - 1}`, ` +${o.items.length - 1} more`) : ''}`;

export function render(v) {
  const all = db.orders();
  const cnt = (s) => all.filter((o) => o.status === s).length;
  const today = all.filter((o) => o.ts >= startOfDay(Date.now()));
  v.innerHTML = `
    <div class="page-head"><h1>${L('Заказы', 'Orders')}<small>${L('Сегодня', 'Today')}: ${today.length} · ${money(today.filter(db.isSale).reduce((s, o) => s + o.total, 0))} · ${L('новых', 'new')}: ${cnt('new')}</small></h1>
      <div class="tg" role="group" aria-label="${L('Вид', 'View')}"><button type="button" data-oview="board" aria-pressed="${or.view === 'board'}"><i class="ph ph-kanban"></i> ${L('Доска', 'Board')}</button><button type="button" data-oview="list" aria-pressed="${or.view === 'list'}"><i class="ph ph-list"></i> ${L('Список', 'List')}</button></div>
      <button class="b" type="button" data-act="export-orders"><i class="ph ph-download-simple"></i><span>CSV</span></button>
      <button class="b pri" type="button" data-act="new-order"><i class="ph ph-plus"></i><span>${L('Продажа в шоуруме', 'In-store sale')}</span></button></div>
    <div class="toolbar-a">
      <label class="search-in"><i class="ph ph-magnifying-glass"></i><input class="in" type="search" id="oq" value="${esc(or.q)}" placeholder="${L('№, имя, телефон или товар', 'No., name, phone or item')}" aria-label="${L('Поиск', 'Search')}"></label>
      <select class="sel" id="operiod" aria-label="${L('Период', 'Period')}">${[['all', L('За всё время', 'All time')], ['today', L('Сегодня', 'Today')], ['7', L('7 дней', '7 days')], ['30', L('30 дней', '30 days')]].map(([k, n]) => `<option value="${k}" ${or.period === k ? 'selected' : ''}>${n}</option>`).join('')}</select>
      <select class="sel" id="osource" aria-label="${L('Источник', 'Source')}">${[['all', L('Сайт и шоурум', 'Site & showroom')], ['site', L('Только сайт', 'Website only')], ['store', L('Только шоурум', 'Showroom only')]].map(([k, n]) => `<option value="${k}" ${or.source === k ? 'selected' : ''}>${n}</option>`).join('')}</select>
      ${or.view === 'board' ? `<label class="switch"><input type="checkbox" id="oshowc" ${or.showCanceled ? 'checked' : ''}>${L('Отменённые', 'Canceled')}</label>` : ''}
    </div>
    ${or.view === 'list' ? `<div class="tg tabs-scroll" role="group" aria-label="${L('Статус', 'Status')}">${[['all', L('Все', 'All'), all.length], ...db.STATUSES.map((s) => [s, T(STATUS_TAB[s]), cnt(s)])].map(([k, n, c]) => `<button type="button" data-ostatus="${k}" aria-pressed="${or.status === k}">${n} <span class="muted">${c}</span></button>`).join('')}</div>` : ''}
    <div id="obox"></div>`;
  renderBox();
  $('#oq', v).addEventListener('input', (e) => { or.q = e.target.value; renderBox(); });
  $('#operiod', v).addEventListener('change', (e) => { or.period = e.target.value; renderBox(); });
  $('#osource', v).addEventListener('change', (e) => { or.source = e.target.value; renderBox(); });
  $('#oshowc', v)?.addEventListener('change', (e) => { or.showCanceled = e.target.checked; renderBox(); });
  v.onclick = onClick;
  v.onchange = onChange;
}

function renderBox() {
  const box = $('#obox');
  if (!box) return;
  if (or.view === 'board') return renderBoard(box);
  const list = filtered();
  box.innerHTML = list.length ? `<div class="tbl-wrap"><table class="tbl tbl-cards"><thead><tr><th>№</th><th>${L('Когда', 'When')}</th><th>${L('Клиент', 'Customer')}</th><th class="hide-md">${L('Состав', 'Items')}</th><th class="n">${L('Сумма', 'Total')}</th><th>${L('Статус', 'Status')}</th></tr></thead><tbody>
    ${list.slice(0, or.limit).map((o) => `<tr class="clickable ${o.status === 'new' ? 'is-new' : ''}" data-order="${o.id}">
      <td class="tnum"><b>${o.no}</b> ${o.source === 'store' ? `<i class="ph ph-storefront muted" title="${L('Шоурум', 'Showroom')}"></i>` : ''}</td>
      <td class="muted" style="white-space:nowrap">${ago(o.ts)}</td>
      <td class="m-r2c12"><b style="font-weight:500">${esc(o.name)}</b><br><span class="muted tnum">${esc(o.phone)}</span></td>
      <td class="hide-md muted">${itemsLine(o)}</td>
      <td class="n m-r2c3"><b style="font-weight:500">${money(o.total)}</b></td>
      <td class="m-r1c3"><select class="status-sel st-${o.status}" data-setstatus="${o.id}" aria-label="${L('Статус заказа', 'Order status')} ${o.no}">${db.STATUSES.map((s) => `<option value="${s}" ${s === o.status ? 'selected' : ''}>${statusName(s)}</option>`).join('')}</select></td></tr>`).join('')}
    </tbody></table>${list.length > or.limit ? `<div class="more"><button class="b" type="button" data-act="more-orders">${L('Показать ещё', 'Show more')} (${list.length - or.limit})</button></div>` : ''}</div>`
    : `<div class="panel"><p class="empty-note">${L('Заказов нет', 'No orders')}</p></div>`;
}

function renderBoard(box) {
  const list = filtered({ ignoreStatus: true });
  const cols = ['new', 'confirmed', 'delivering', 'done', ...(or.showCanceled ? ['canceled'] : [])];
  const recentDone = Date.now() - 14 * DAY;
  box.innerHTML = `<div class="board" style="--cols:${cols.length}">${cols.map((s) => {
    let items = list.filter((o) => o.status === s);
    const hidden = s === 'done' || s === 'canceled' ? items.filter((o) => o.ts < recentDone).length : 0;
    if (hidden && !or.q) items = items.filter((o) => o.ts >= recentDone);
    const sum = items.reduce((a, o) => a + o.total, 0);
    return `<section class="col" data-col="${s}" aria-label="${statusName(s)}">
      <header><span class="pill st-${s}">${T(STATUS_TAB[s])}</span><b>${items.length}</b><span class="muted">${money(sum)}</span></header>
      <div class="col-body">${items.map(cardHtml).join('') || `<p class="col-empty">${s === 'new' ? L('Новых заказов нет', 'No new orders') : L('Перетащите сюда', 'Drop here')}</p>`}
      ${hidden && !or.q ? `<button class="b sm ghost" type="button" data-oview="list" data-ostatus="${s}">${L(`Старше 2 недель: ${hidden}`, `Older than 2 weeks: ${hidden}`)}</button>` : ''}</div>
    </section>`;
  }).join('')}</div>`;
  initDrag(box);
}

const cardHtml = (o) => `<article class="ocard ${o.status === 'new' ? 'is-new' : ''}" draggable="true" data-order="${o.id}" tabindex="0" aria-label="${L('Заказ', 'Order')} ${o.no}, ${esc(o.name)}, ${money(o.total)}">
  <div class="oc-top"><b>№${o.no}</b>${o.source === 'store' ? `<i class="ph ph-storefront" title="${L('Шоурум', 'Showroom')}"></i>` : ''}<span class="muted">${ago(o.ts)}</span></div>
  <p class="oc-name">${esc(o.name)}</p>
  <p class="oc-items">${itemsLine(o)}</p>
  <div class="oc-bot"><b>${money(o.total)}</b><span class="muted"><i class="ph ${o.delivery === 'pickup' ? 'ph-storefront' : 'ph-truck'}"></i>${o.delivery === 'pickup' ? L('самовывоз', 'pickup') : L('доставка', 'delivery')}</span></div>
  ${NEXT[o.status] ? `<button class="b sm oc-next" type="button" data-next="${o.id}"><i class="ph ${NEXT[o.status][2]}"></i>${T(NEXT[o.status][1])}</button>` : ''}
</article>`;

function initDrag(box) {
  let dragId = null;
  box.addEventListener('dragstart', (e) => {
    const c = e.target.closest('.ocard'); if (!c) return;
    dragId = c.dataset.order; c.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', dragId);
  });
  box.addEventListener('dragend', (e) => { e.target.closest('.ocard')?.classList.remove('dragging'); $$('.col.over', box).forEach((c) => c.classList.remove('over')); });
  box.addEventListener('dragover', (e) => { const col = e.target.closest('.col'); if (!col || !dragId) return; e.preventDefault(); $$('.col.over', box).forEach((c) => c !== col && c.classList.remove('over')); col.classList.add('over'); });
  box.addEventListener('dragleave', (e) => { const col = e.target.closest('.col'); if (col && !col.contains(e.relatedTarget)) col.classList.remove('over'); });
  box.addEventListener('drop', async (e) => {
    const col = e.target.closest('.col'); if (!col || !dragId) return;
    e.preventDefault(); col.classList.remove('over');
    const id = dragId; dragId = null;
    await changeStatus(id, col.dataset.col);
  });
}

export async function changeStatus(id, status, btn) {
  const o = db.orders().find((x) => x.id === id);
  if (!o || o.status === status) return false;
  if (status === 'canceled' && !(await confirmBox({ title: L(`Отменить заказ №${o.no}?`, `Cancel order #${o.no}?`), text: L('Товары вернутся на склад.', 'Items go back to stock.'), ok: L('Отменить заказ', 'Cancel order') }))) { refresh(); return false; }
  const prev = o.status, no = o.no;
  const r = await run(() => db.setOrderStatus(id, status), btn);
  if (r.ok) toast(L(`№${no}: ${statusName(status).toLowerCase()}`, `#${no}: ${statusName(status).toLowerCase()}`), L('Вернуть', 'Undo'), () => run(() => db.setOrderStatus(id, prev)));
  return r.ok;
}

async function onClick(e) {
  const t = e.target.closest('button, tr[data-order], article[data-order]');
  if (!t) return;
  if (t.dataset.oview) {
    or.view = t.dataset.oview; try { localStorage.setItem('tor:ordersView', or.view); } catch (err) {}
    if (t.dataset.ostatus) or.status = t.dataset.ostatus;
    return refresh();
  }
  if (t.dataset.ostatus) { or.status = t.dataset.ostatus; or.limit = 80; return refresh(); }
  if (t.dataset.act === 'more-orders') { or.limit += 150; return renderBox(); }
  if (t.dataset.act === 'export-orders') return exportOrders();
  if (t.dataset.act === 'new-order') return openManualOrder();
  if (t.dataset.next) { e.stopPropagation(); const o = db.orders().find((x) => x.id === t.dataset.next); return changeStatus(o.id, NEXT[o.status][0], t); }
  if (t.dataset.order && !e.target.closest('select, button')) openOrderSheet(t.dataset.order);
}
async function onChange(e) {
  const sel = e.target.closest('[data-setstatus]');
  if (sel) await changeStatus(sel.dataset.setstatus, sel.value);
}
document.addEventListener('keydown', (e) => {
  const c = e.target.closest?.('.ocard');
  if (c && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); openOrderSheet(c.dataset.order); }
});

// ——— Карточка заказа
export function openOrderSheet(id, opts = {}) {
  const o = db.orders().find((x) => x.id === id);
  if (!o) return;
  const step = { new: 1, confirmed: 2, delivering: 3, done: 4, canceled: 0 }[o.status];
  const nx = NEXT[o.status];
  const editing = opts.edit;
  const wa = `https://wa.me/${digits(o.phone)}?text=${encodeURIComponent(L(`Здравствуйте, ${o.name.split(' ')[0]}! Это мебельный магазин ТӨР, по вашему заказу №${o.no}.`, `Hello ${o.name.split(' ')[0]}! This is TÖR furniture about your order #${o.no}.`))}`;
  const d = sheet(sheetHead(`${L('Заказ', 'Order')} №${o.no}`, `${fTime(o.ts)} · ${o.source === 'store' ? L('шоурум', 'showroom') : L('сайт', 'website')}`, statusPill(o.status) + `<button class="b ghost icon" type="button" data-print aria-label="${L('Печать', 'Print')}" title="${L('Печать накладной', 'Print invoice')}"><i class="ph ph-printer"></i></button>`) + `
    <div class="sh-body">
      <div class="o-steps ${o.status}">${[1, 2, 3, 4].map((i) => `<span class="${i <= step ? 'on' : ''}"></span>`).join('')}</div>
      ${o.phone ? `<div class="quick-acts"><a class="b" href="tel:${esc(o.phone.replace(/\s/g, ''))}"><i class="ph ph-phone"></i>${L('Позвонить', 'Call')}</a><a class="b" href="${wa}" target="_blank" rel="noopener"><i class="ph ph-whatsapp-logo"></i>WhatsApp</a><button class="b" type="button" data-copy><i class="ph ph-copy"></i>${L('Копировать', 'Copy')}</button></div>` : ''}
      <section class="sec"><h3>${L('Клиент', 'Customer')}${editing ? '' : `<button class="b sm" type="button" data-edit-order><i class="ph ph-pencil-simple"></i>${L('Изменить', 'Edit')}</button>`}</h3>
        ${editing ? `<form class="op" id="oedit">
          <div class="row"><label class="fld"><span>${L('Имя', 'Name')}</span><input class="in" name="name" value="${esc(o.name)}" required></label><label class="fld"><span>${L('Телефон', 'Phone')}</span><input class="in" name="phone" type="tel" value="${esc(o.phone)}"></label></div>
          <label class="fld"><span>${L('Получение', 'Delivery')}</span><select class="sel" name="delivery"><option value="delivery" ${o.delivery === 'delivery' ? 'selected' : ''}>${L('Доставка', 'Delivery')}</option><option value="pickup" ${o.delivery === 'pickup' ? 'selected' : ''}>${L('Самовывоз', 'Pickup')}</option></select></label>
          <label class="fld"><span>${L('Адрес', 'Address')}</span><input class="in" name="address" value="${esc(o.address)}"></label>
          <label class="fld"><span>${L('Комментарий клиента', 'Customer comment')}</span><input class="in" name="comment" value="${esc(o.comment)}"></label>
          <div class="acts" style="display:flex;gap:8px;justify-content:flex-end"><button class="b" type="button" data-cancel-edit>${L('Отмена', 'Cancel')}</button><button class="b pri" type="submit">${L('Сохранить', 'Save')}</button></div></form>`
        : `<dl class="kv"><dt>${L('Имя', 'Name')}</dt><dd>${esc(o.name)} ${clientBadge(o)}</dd><dt>${L('Телефон', 'Phone')}</dt><dd>${o.phone ? esc(o.phone) : '—'}</dd>
          <dt>${L('Получение', 'Delivery')}</dt><dd>${o.delivery === 'pickup' ? L('Самовывоз, Абая 150', 'Pickup, 150 Abay Ave') : L('Доставка: ', 'Delivery: ') + esc(o.address || '—')}</dd>
          ${o.comment ? `<dt>${L('Комментарий', 'Comment')}</dt><dd>${esc(o.comment)}</dd>` : ''}</dl>`}</section>
      <section class="sec"><h3>${L('Заметка менеджера', 'Manager note')}<small class="muted" id="noteState" style="text-transform:none;letter-spacing:0"></small></h3>
        <textarea class="ta" id="onote" placeholder="${L('Видна только сотрудникам: договорились о доставке в субботу…', 'Staff only: agreed on Saturday delivery…')}">${esc(o.note || '')}</textarea></section>
      <section class="sec"><h3>${L('Состав', 'Items')}</h3><div class="o-lines">${o.items.map((it) => { const p = db.product(it.pid); return `<div class="o-line"><img src="${pimg(p)}" alt=""><div>${esc(T(it.name))}<small>${it.color ? esc(it.color) + ' · ' : ''}${it.qty} × ${money(it.price)}${p && p.stock < 0 ? ' · <span style="color:var(--bad)">' + L('нет на складе', 'not in stock') + '</span>' : ''}</small></div><b class="tnum">${money(it.qty * it.price)}</b></div>`; }).join('')}</div>
        <dl class="kv" style="border-top:1px solid var(--line);padding-top:10px">${o.fee ? `<dt>${L('Доставка', 'Delivery')}</dt><dd class="n">${money(o.fee)}</dd>` : ''}<dt><b>${L('Итого', 'Total')}</b></dt><dd class="n"><b>${money(o.total)}</b></dd><dt>${L('Валовая прибыль', 'Gross profit')}</dt><dd class="n">${money(db.orderProfit(o))}</dd></dl></section>
      ${o.log?.length ? `<section class="sec"><h3>${L('История', 'History')}</h3><ul class="log">${o.log.map(([ts, s, who]) => `<li><span>${fTime(ts)}</span>${statusName(s)}${who && who !== 'demo' ? ` <span class="muted">· ${esc(who)}</span>` : ''}</li>`).join('')}</ul></section>` : ''}
    </div>
    <div class="sh-foot">${o.status !== 'canceled' && o.status !== 'done' ? `<button class="b danger" type="button" data-ost="canceled">${L('Отменить', 'Cancel order')}</button>` : ''}${o.status === 'canceled' ? `<button class="b" type="button" data-ost="new">${L('Восстановить', 'Restore')}</button>` : ''}<span class="grow"></span>
      ${nx ? `<button class="b pri" type="button" data-ost="${nx[0]}"><i class="ph ${nx[2]}"></i>${T(nx[1])}</button>` : `<button class="b" type="button" data-close>${L('Закрыть', 'Close')}</button>`}</div>`, { narrow: true, id: o.id });

  d.addEventListener('click', async (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.ost) { if (await changeStatus(o.id, b.dataset.ost, b)) openOrderSheet(o.id); }
    else if (b.dataset.editOrder != null) openOrderSheet(o.id, { edit: true });
    else if (b.dataset.cancelEdit != null) openOrderSheet(o.id);
    else if (b.dataset.print != null) printOrder(o);
    else if (b.dataset.copy != null) {
      const text = `${L('Заказ', 'Order')} №${o.no}\n${o.name} ${o.phone}\n${o.delivery === 'pickup' ? L('Самовывоз', 'Pickup') : o.address}\n${o.items.map((it) => `• ${T(it.name)} × ${it.qty} = ${money(it.qty * it.price)}`).join('\n')}\n${L('Итого', 'Total')}: ${money(o.total)}`;
      navigator.clipboard?.writeText(text).then(() => toast(L('Скопировано', 'Copied')), () => toast(L('Не удалось скопировать', 'Copy failed')));
    }
  });
  $('#oedit', d)?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.target;
    const patch = { name: f.name.value.trim(), phone: f.phone.value.trim(), delivery: f.delivery.value, address: f.address.value.trim(), comment: f.comment.value.trim() };
    if (patch.name.length < 2) { f.name.setAttribute('aria-invalid', 'true'); f.name.focus(); return; }
    const r = await run(() => db.updateOrder(o.id, patch), f.querySelector('[type="submit"]'));
    if (r.ok) { toast(L('Сохранено', 'Saved')); openOrderSheet(o.id); }
  });
  const note = $('#onote', d);
  let noteTimer;
  note.addEventListener('input', () => {
    $('#noteState', d).textContent = L('печатаете…', 'typing…');
    clearTimeout(noteTimer);
    noteTimer = setTimeout(async () => {
      $('#noteState', d).textContent = L('сохраняем…', 'saving…');
      const r = await run(() => db.updateOrder(o.id, { note: note.value.trim() }));
      $('#noteState', d).textContent = r.ok ? L('сохранено', 'saved') : '';
    }, 800);
  });
}

// Постоянный клиент? Считаем заказы по телефону
function clientBadge(o) {
  const ph = digits(o.phone);
  if (!ph) return '';
  const n = db.orders().filter((x) => digits(x.phone) === ph && x.status !== 'canceled').length;
  return n > 1 ? `<span class="pill acc plain">${L(`${n}-й заказ`, `order #${n}`)}</span>` : `<span class="pill plain">${L('новый клиент', 'first order')}</span>`;
}

function printOrder(o) {
  const w = window.open('', '_blank', 'width=720,height=900');
  if (!w) { toast(L('Разрешите всплывающие окна для печати', 'Allow pop-ups to print')); return; }
  w.document.write(`<!doctype html><meta charset="utf-8"><title>№${o.no}</title><style>body{font:14px/1.5 system-ui,sans-serif;margin:40px;color:#111}h1{font-size:22px;margin:0 0 4px}table{width:100%;border-collapse:collapse;margin:20px 0}td,th{padding:8px 4px;border-bottom:1px solid #ddd;text-align:left}td.n,th.n{text-align:right}.muted{color:#666}.tot{font-size:18px;font-weight:600}</style>
    <h1>TÖR · ${L('Заказ', 'Order')} №${o.no}</h1><p class="muted">${fTime(o.ts)} · ${statusName(o.status)}</p>
    <p><b>${esc(o.name)}</b><br>${esc(o.phone)}<br>${o.delivery === 'pickup' ? L('Самовывоз: Алматы, пр. Абая, 150', 'Pickup: 150 Abay Ave, Almaty') : esc(o.address)}</p>
    <table><tr><th>${L('Товар', 'Item')}</th><th class="n">${L('Кол-во', 'Qty')}</th><th class="n">${L('Цена', 'Price')}</th><th class="n">${L('Сумма', 'Sum')}</th></tr>
    ${o.items.map((it) => `<tr><td>${esc(T(it.name))}${it.color ? ` <span class="muted">(${esc(it.color)})</span>` : ''}</td><td class="n">${it.qty}</td><td class="n">${money(it.price)}</td><td class="n">${money(it.qty * it.price)}</td></tr>`).join('')}
    ${o.fee ? `<tr><td colspan="3">${L('Доставка', 'Delivery')}</td><td class="n">${money(o.fee)}</td></tr>` : ''}</table>
    <p class="tot">${L('Итого', 'Total')}: ${money(o.total)}</p>${o.comment ? `<p>${L('Комментарий', 'Comment')}: ${esc(o.comment)}</p>` : ''}
    <p class="muted" style="margin-top:48px">${L('Подпись клиента', 'Customer signature')} ____________________</p><script>print()<\/script>`);
  w.document.close();
}

export function exportOrders() {
  const rows = [['№', L('Дата', 'Date'), L('Статус', 'Status'), L('Клиент', 'Customer'), L('Телефон', 'Phone'), L('Получение', 'Delivery'), L('Адрес', 'Address'), L('Состав', 'Items'), L('Сумма', 'Total'), L('Прибыль', 'Profit'), L('Источник', 'Source'), L('Заметка', 'Note')]];
  filtered().forEach((o) => rows.push([o.no, new Date(o.ts).toLocaleString(EN ? 'en-GB' : 'ru-RU'), statusName(o.status), o.name, o.phone, o.delivery, o.address, o.items.map((i) => `${T(i.name)} ×${i.qty}`).join(', '), o.total, db.orderProfit(o), o.source, o.note || '']));
  download(`tor-orders-${stamp()}.csv`, csv(rows), 'text/csv');
}

// ——— Продажа в шоуруме: менеджер собирает заказ вручную
let mo = null;
export function openManualOrder() {
  mo = { name: '', phone: '', delivery: 'pickup', address: '', comment: '', items: [], pick: db.products().find((p) => p.stock > 0)?.id, qty: 1 };
  const d = sheet(sheetHead(L('Продажа в шоуруме', 'In-store sale'), L('Товары спишутся со склада сразу', 'Items are deducted from stock at once')) + `
    <form class="sh-body" id="moform" novalidate></form>
    <div class="sh-foot"><span class="grow" id="moTotal"></span><button class="b" type="button" data-close>${L('Отмена', 'Cancel')}</button><button class="b pri" type="submit" form="moform">${L('Создать заказ', 'Create order')}</button></div>`, { narrow: true });
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
  f.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!mo.items.length) { toast(L('Добавьте хотя бы один товар', 'Add at least one item')); return; }
    if (mo.name.trim().length < 2) { $('[data-mo="name"]', d).setAttribute('aria-invalid', 'true'); $('[data-mo="name"]', d).focus(); return; }
    const r = await run(() => db.createOrder({ ...mo, name: mo.name.trim(), source: 'store' }), $('[type="submit"]', d));
    if (!r.ok) return;
    d.close();
    const created = r.value;
    toast(L(`Заказ №${created.no} создан`, `Order #${created.no} created`), L('Открыть', 'Open'), () => openOrderSheet(created.id));
  });
}

function renderMO() {
  const f = $('#moform');
  const sub = mo.items.reduce((s, i) => s + db.product(i.pid).price * i.qty, 0);
  const sset = db.settings();
  const fee = mo.delivery === 'delivery' && sub < sset.freeDelivery ? sset.deliveryFee : 0;
  f.innerHTML = `
    <section class="sec"><h3>${L('Товары', 'Items')}</h3>
      <div class="add-line"><select class="sel" data-mo="pick" aria-label="${L('Товар', 'Product')}">${db.categories().map((c) => { const ps = db.products().filter((p) => p.cat === c.id); return ps.length ? `<optgroup label="${esc(T(c.name))}">${ps.map((p) => `<option value="${p.id}" ${p.id === mo.pick ? 'selected' : ''}>${esc(T(p.name))} · ${money(p.price)} · ${L('ост.', 'stock')} ${p.stock}</option>`).join('')}</optgroup>` : ''; }).join('')}</select>
        <input class="in" type="number" min="1" value="${mo.qty}" data-mo="qty" aria-label="${L('Количество', 'Quantity')}"><button class="b" type="button" data-mo-add aria-label="${L('Добавить', 'Add')}"><i class="ph ph-plus"></i></button></div>
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

export { itemsLine };
