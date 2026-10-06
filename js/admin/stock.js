// Склад: остатки, приход/списание/инвентаризация, журнал движений.
import * as db from '../db.js';
import { $, L, T, EN, esc, money, num, fTime, plural, pimg, stockPill, toast, run, sheet, sheetHead, download, csv, stamp } from './ui.js';

const st = { type: 'all', q: '', limit: 80, tab: 'log' };
let op = { type: 'in', pid: '', qty: '', cost: '', note: '' };
const moveCls = { in: 'ok', out: 'bad', sale: 'acc', return: 'warn', adjust: '' };

export function render(v) {
  const prods = db.products();
  const sum = (f) => prods.reduce((s, p) => s + f(p), 0);
  const need = prods.filter((p) => p.stock <= p.min);
  v.innerHTML = `
    <div class="page-head"><h1>${L('Склад', 'Stock')}<small>${L('Остаток меняется только операциями — так всегда видно, откуда цифра', 'Stock changes only through entries, so every number has a history')}</small></h1>
      <button class="b" type="button" data-act="export-moves"><i class="ph ph-download-simple"></i><span>${L('Журнал CSV', 'Log CSV')}</span></button>
      <button class="b pri" type="button" data-op=""><i class="ph ph-plus"></i><span>${L('Новая операция', 'New entry')}</span></button></div>
    <div class="tiles">
      <div class="tile"><span class="tile-label"><i class="ph ph-stack"></i>${L('Единиц на складе', 'Units in stock')}</span><span class="tile-value">${num(sum((p) => Math.max(p.stock, 0)))}</span><span class="tile-sub">${prods.length} ${L(plural(prods.length, 'позиция', 'позиции', 'позиций'), 'items')}</span></div>
      <div class="tile"><span class="tile-label"><i class="ph ph-coins"></i>${L('По себестоимости', 'At cost')}</span><span class="tile-value">${money(sum((p) => Math.max(p.stock, 0) * p.cost))}</span><span class="tile-sub">${L('во что вложены деньги', 'money tied up')}</span></div>
      <div class="tile"><span class="tile-label"><i class="ph ph-tag"></i>${L('В розничных ценах', 'At retail')}</span><span class="tile-value">${money(sum((p) => Math.max(p.stock, 0) * p.price))}</span><span class="tile-sub">${L('если продать всё', 'if everything sells')}</span></div>
      <div class="tile"><span class="tile-label"><i class="ph ph-warning"></i>${L('Пора заказать', 'Reorder now')}</span><span class="tile-value">${need.length}</span><span class="tile-sub">${L('на пороге или ниже', 'at or below threshold')}</span></div>
    </div>
    <div class="toolbar-a">
      <div class="tg" role="group"><button type="button" data-stab="log" aria-pressed="${st.tab === 'log'}">${L('Журнал', 'Log')}</button><button type="button" data-stab="levels" aria-pressed="${st.tab === 'levels'}">${L('Остатки', 'Levels')}</button></div>
      <label class="search-in"><i class="ph ph-magnifying-glass"></i><input class="in" type="search" id="sq" value="${esc(st.q)}" placeholder="${L('Товар или комментарий', 'Product or note')}" aria-label="${L('Поиск', 'Search')}"></label>
      ${st.tab === 'log' ? `<select class="sel" id="stype" aria-label="${L('Тип операции', 'Entry type')}"><option value="all">${L('Все операции', 'All entries')}</option>${Object.entries(db.MOVE_NAME).map(([k, n]) => `<option value="${k}" ${st.type === k ? 'selected' : ''}>${T(n)}</option>`).join('')}</select>` : ''}
    </div>
    <div id="mtable"></div>`;
  renderBody();
  $('#sq', v).addEventListener('input', (e) => { st.q = e.target.value; st.limit = 80; renderBody(); });
  $('#stype', v)?.addEventListener('change', (e) => { st.type = e.target.value; st.limit = 80; renderBody(); });
  v.onclick = (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.op != null) return openStockSheet(b.dataset.op || null, 'in');
    if (b.dataset.stab) { st.tab = b.dataset.stab; return render(v); }
    if (b.dataset.act === 'more-moves') { st.limit += 150; return renderBody(); }
    if (b.dataset.act === 'export-moves') return exportMoves();
  };
}

function renderBody() {
  const box = $('#mtable');
  if (!box) return;
  const q = st.q.trim().toLowerCase();
  if (st.tab === 'levels') {
    const list = db.products().filter((p) => !q || [...p.name, p.sku].join(' ').toLowerCase().includes(q)).sort((a, b) => a.stock - a.min - (b.stock - b.min));
    box.innerHTML = `<div class="tbl-wrap"><table class="tbl tbl-cards"><thead><tr><th>${L('Товар', 'Product')}</th><th class="c">${L('Остаток', 'Stock')}</th><th class="n hide-md">${L('Порог', 'Threshold')}</th><th class="n hide-md">${L('На сумму', 'Value')}</th><th class="w0"></th></tr></thead><tbody>
      ${list.map((p) => `<tr><td class="m-r1c12"><div class="prod-cell"><img src="${pimg(p)}" alt="" loading="lazy"><div><b>${esc(T(p.name))}</b><small>${esc(p.sku)}</small></div></div></td><td class="c m-r1c3">${stockPill(p)}</td><td class="n hide-md m-hide">${p.min}</td><td class="n hide-md m-hide">${money(Math.max(p.stock, 0) * p.cost)}</td>
        <td class="w0 m-r2c12"><div style="display:flex;gap:4px"><button class="b sm" type="button" data-op="${p.id}">${L('Приход', 'Receive')}</button></div></td></tr>`).join('')}</tbody></table></div>`;
    return;
  }
  const list = db.moves().filter((m) => {
    if (st.type !== 'all' && m.type !== st.type) return false;
    if (q) { const p = db.product(m.pid); if (![...(p?.name || []), p?.sku, m.note, m.author].join(' ').toLowerCase().includes(q)) return false; }
    return true;
  });
  box.innerHTML = list.length ? `<div class="tbl-wrap"><table class="tbl tbl-cards"><thead><tr><th>${L('Дата', 'Date')}</th><th>${L('Товар', 'Product')}</th><th>${L('Операция', 'Type')}</th><th class="n">${L('Кол-во', 'Qty')}</th><th class="n hide-md">${L('Сумма (себест.)', 'Value (cost)')}</th><th class="hide-md">${L('Комментарий', 'Note')}</th></tr></thead><tbody>
    ${list.slice(0, st.limit).map((m) => {
      const p = db.product(m.pid);
      return `<tr><td class="muted m-meta m-r2c23 tnum" style="white-space:nowrap">${fTime(m.ts)}</td>
        <td class="m-r1c12"><div class="prod-cell"><img src="${pimg(p)}" alt="" loading="lazy"><div><b>${esc(p ? T(p.name) : L('Удалённый товар', 'Deleted product'))}</b><small>${esc(p?.sku || m.pid)}</small></div></div></td>
        <td class="m-r2c1"><span class="pill ${moveCls[m.type]}">${T(db.MOVE_NAME[m.type])}</span></td>
        <td class="n m-r1c3"><span class="${m.qty > 0 ? 'qty-plus' : 'qty-minus'}">${m.qty > 0 ? '+' : '−'}${Math.abs(m.qty)}</span></td>
        <td class="n hide-md m-hide">${money(Math.abs(m.qty) * (m.cost || 0))}</td>
        <td class="hide-md m-meta muted">${esc(m.note)}${m.author && m.author !== 'demo' ? ` · ${esc(m.author)}` : ''}</td></tr>`;
    }).join('')}</tbody></table>
    ${list.length > st.limit ? `<div class="more"><button class="b" type="button" data-act="more-moves">${L('Показать ещё', 'Show more')} (${list.length - st.limit})</button></div>` : ''}</div>`
    : `<div class="panel"><p class="empty-note">${L('Операций не найдено', 'No entries found')}</p></div>`;
}

function exportMoves() {
  const rows = [[L('Дата', 'Date'), L('Артикул', 'SKU'), L('Товар', 'Product'), L('Операция', 'Type'), L('Кол-во', 'Qty'), L('Себестоимость', 'Unit cost'), L('Комментарий', 'Note'), L('Сотрудник', 'Staff')]];
  db.moves().forEach((m) => { const p = db.product(m.pid); rows.push([new Date(m.ts).toLocaleString(EN ? 'en-GB' : 'ru-RU'), p?.sku || '', p ? T(p.name) : m.pid, T(db.MOVE_NAME[m.type]), m.qty, m.cost || '', m.note, m.author || '']); });
  download(`tor-stock-${stamp()}.csv`, csv(rows), 'text/csv');
}

export function openStockSheet(pid, type) {
  op = { type: type || 'in', pid: pid || op.pid || db.products()[0]?.id, qty: '', cost: '', note: '' };
  const d = sheet(sheetHead(L('Складская операция', 'Stock entry'), L('Остаток изменится сразу и попадёт в журнал', 'Stock updates at once and goes to the log')) + `
    <form class="sh-body op" id="opform" novalidate></form>
    <div class="sh-foot"><span class="grow"></span><button class="b" type="button" data-close>${L('Отмена', 'Cancel')}</button><button class="b pri" type="submit" form="opform">${L('Провести', 'Post')}</button></div>`, { narrow: true });
  renderOpForm();
  const f = $('#opform', d);
  f.addEventListener('input', (e) => { const k = e.target.dataset.opk; if (!k) return; op[k] = e.target.value; e.target.removeAttribute('aria-invalid'); if (k === 'pid') renderOpForm(); else renderPreview(); });
  f.addEventListener('click', (e) => { const b = e.target.closest('[data-optype]'); if (b) { op.type = b.dataset.optype; renderOpForm(); } });
  f.addEventListener('submit', async (e) => {
    e.preventDefault();
    const qty = Math.round(+op.qty);
    const q = $('[data-opk="qty"]', d);
    if (op.qty === '' || qty < 0 || (op.type !== 'adjust' && qty === 0)) { q.setAttribute('aria-invalid', 'true'); q.focus(); return; }
    const r = await run(() => db.stockMove({ pid: op.pid, type: op.type, qty, note: op.note.trim(), cost: op.type === 'in' && op.cost !== '' ? +op.cost : null }), $('[type="submit"]', d));
    if (!r.ok) return;
    d.close();
    toast(r.value ? L('Проведено', 'Posted') : L('Остаток не изменился', 'Stock unchanged'));
  });
  setTimeout(() => $('[data-opk="qty"]', d)?.focus(), 60);
}

function renderOpForm() {
  const f = $('#opform');
  const p = db.product(op.pid);
  const types = [['in', 'ph-arrow-down-left', L('Приход', 'Receipt')], ['out', 'ph-arrow-up-right', L('Списание', 'Write-off')], ['adjust', 'ph-clipboard-text', L('Инвентаризация', 'Stock count')]];
  f.innerHTML = `
    <div class="tg" role="group" aria-label="${L('Тип', 'Type')}" style="justify-self:start">${types.map(([k, ic, n]) => `<button type="button" data-optype="${k}" aria-pressed="${op.type === k}"><i class="ph ${ic}"></i> ${n}</button>`).join('')}</div>
    <label class="fld"><span>${L('Товар', 'Product')}</span><select class="sel" data-opk="pid">${db.categories().map((c) => { const ps = db.products().filter((x) => x.cat === c.id); return ps.length ? `<optgroup label="${esc(T(c.name))}">${ps.map((x) => `<option value="${x.id}" ${x.id === op.pid ? 'selected' : ''}>${esc(T(x.name))} · ${esc(x.sku)} · ${x.stock}</option>`).join('')}</optgroup>` : ''; }).join('')}</select></label>
    <div class="row"><label class="fld"><span>${op.type === 'adjust' ? L('Фактически на складе', 'Actual count') : L('Количество, шт.', 'Quantity, pcs')}</span><input class="in" type="number" min="0" inputmode="numeric" data-opk="qty" value="${op.qty}"></label>
      ${op.type === 'in' ? `<label class="fld"><span>${L('Цена закупки за шт.', 'Unit cost')}</span><input class="in" type="number" min="0" step="500" inputmode="numeric" data-opk="cost" value="${op.cost}" placeholder="${p ? num(p.cost) : ''}"></label>` : '<span></span>'}</div>
    <label class="fld"><span>${L('Комментарий', 'Note')}</span><input class="in" data-opk="note" value="${esc(op.note)}" placeholder="${op.type === 'in' ? L('Накладная №, поставщик', 'Invoice no., supplier') : op.type === 'out' ? L('Брак, образец для шоурума…', 'Damage, showroom sample…') : L('Плановая инвентаризация', 'Scheduled count')}"></label>
    <div class="op-preview" id="opPreview"></div>
    ${op.type === 'in' ? `<p class="muted" style="font-size:13px">${L('Если цена закупки отличается, себестоимость пересчитается как средневзвешенная.', 'If the unit cost differs, the cost price is recalculated as a weighted average.')}</p>` : ''}`;
  renderPreview();
}

function renderPreview() {
  const p = db.product(op.pid);
  const box = $('#opPreview');
  if (!p || !box) return;
  const q = Math.round(+op.qty || 0);
  const after = op.type === 'in' ? p.stock + q : op.type === 'out' ? p.stock - q : op.qty === '' ? p.stock : q;
  box.innerHTML = `<img src="${pimg(p)}" alt=""><div style="flex:1"><div>${esc(T(p.name))}</div><div class="muted">${L('Остаток', 'Stock')}</div></div><b>${p.stock}</b><i class="ph ph-arrow-right arrow"></i><b style="color:${after < 0 ? 'var(--bad)' : after !== p.stock ? 'var(--accent)' : 'inherit'}">${after}</b>`;
}
