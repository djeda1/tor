// Товары: таблица с фильтрами и массовыми действиями, редактор карточки, архив.
import * as db from '../db.js';
import { $, $$, L, T, EN, esc, money, fDate, plural, pimg, thumb, catName, stockPill, toast, run, confirmBox, sheet, sheetHead, download, csv, stamp, refresh } from './ui.js';
import { openStockSheet } from './stock.js';

const pr = { q: '', cat: 'all', filter: 'all', sort: 'created', dir: -1, sel: new Set() };
export const setCatFilter = (cat) => { pr.cat = cat; pr.filter = 'all'; };

function rows() {
  const q = pr.q.trim().toLowerCase();
  const base = pr.filter === 'archived' ? db.archived() : db.products();
  const list = base.filter((p) => {
    if (pr.cat !== 'all' && p.cat !== pr.cat) return false;
    if (pr.filter === 'low' && !(p.stock > 0 && p.stock <= p.min)) return false;
    if (pr.filter === 'out' && p.stock > 0) return false;
    if (pr.filter === 'hidden' && p.visible) return false;
    if (pr.filter === 'sale' && !(p.old > p.price)) return false;
    if (q && ![...p.name, p.sku, ...p.mat].join(' ').toLowerCase().includes(q)) return false;
    return true;
  });
  const key = { name: (p) => T(p.name).toLowerCase(), price: (p) => p.price, stock: (p) => p.stock, margin: (p) => (p.price ? (p.price - p.cost) / p.price : 0), created: (p) => p.created, cat: (p) => catName(p.cat) }[pr.sort];
  return list.sort((a, b) => { const x = key(a), y = key(b); return (x > y ? 1 : x < y ? -1 : 0) * pr.dir; });
}

export function render(v) {
  const all = db.products();
  const c = { low: all.filter((p) => p.stock > 0 && p.stock <= p.min).length, out: all.filter((p) => p.stock <= 0).length, hidden: all.filter((p) => !p.visible).length, arch: db.archived().length };
  v.innerHTML = `
    <div class="page-head"><h1>${L('Товары', 'Products')}<small>${all.length} ${L(plural(all.length, 'позиция', 'позиции', 'позиций'), 'items')} · ${L('на сайте', 'live')} ${all.length - c.hidden}</small></h1>
      <button class="b" type="button" data-act="export-products"><i class="ph ph-download-simple"></i><span>CSV</span></button>
      <button class="b pri" type="button" data-act="new-product"><i class="ph ph-plus"></i><span>${L('Добавить товар', 'Add product')}</span></button></div>
    <div class="toolbar-a">
      <label class="search-in"><i class="ph ph-magnifying-glass"></i><input class="in" type="search" id="pq" value="${esc(pr.q)}" placeholder="${L('Название, артикул, материал', 'Name, SKU, material')}" aria-label="${L('Поиск', 'Search')}"></label>
      <select class="sel" id="pcat" aria-label="${L('Категория', 'Category')}"><option value="all">${L('Все категории', 'All categories')}</option>${db.categories().map((x) => `<option value="${x.id}" ${pr.cat === x.id ? 'selected' : ''}>${esc(T(x.name))}</option>`).join('')}</select>
      <select class="sel" id="pfilter" aria-label="${L('Фильтр', 'Filter')}">
        ${[['all', L('Все товары', 'All products')], ['low', L(`Заканчиваются (${c.low})`, `Running low (${c.low})`)], ['out', L(`Нет в наличии (${c.out})`, `Out of stock (${c.out})`)], ['hidden', L(`Скрыты с сайта (${c.hidden})`, `Hidden (${c.hidden})`)], ['sale', L('Со скидкой', 'On sale')], ['archived', L(`Архив (${c.arch})`, `Archive (${c.arch})`)]].map(([k, n]) => `<option value="${k}" ${pr.filter === k ? 'selected' : ''}>${n}</option>`).join('')}
      </select>
    </div>
    <div id="ptable"></div>`;
  renderTable();
  $('#pq', v).addEventListener('input', (e) => { pr.q = e.target.value; renderTable(); });
  $('#pcat', v).addEventListener('change', (e) => { pr.cat = e.target.value; renderTable(); });
  $('#pfilter', v).addEventListener('change', (e) => { pr.filter = e.target.value; pr.sel.clear(); renderTable(); });
  v.onclick = onClick;
}

function renderTable() {
  const box = $('#ptable');
  if (!box) return;
  const list = rows();
  const arch = pr.filter === 'archived';
  for (const id of [...pr.sel]) if (!db.product(id)) pr.sel.delete(id);
  const th = (k, label, cls = '') => `<th class="${cls}"><button type="button" data-sort="${k}">${label}${pr.sort === k ? `<i class="ph ph-caret-${pr.dir > 0 ? 'up' : 'down'}"></i>` : ''}</button></th>`;
  const allSel = list.length && list.every((p) => pr.sel.has(p.id));
  box.innerHTML = list.length ? `<div class="tbl-wrap"><table class="tbl tbl-cards">
    <thead><tr>${arch ? '' : `<th class="w0"><input type="checkbox" data-selall ${allSel ? 'checked' : ''} aria-label="${L('Выбрать все', 'Select all')}"></th>`}${th('name', L('Товар', 'Product'))}${th('cat', L('Категория', 'Category'), 'hide-md')}${th('price', L('Цена', 'Price'), 'n')}<th class="n hide-md">${L('Себест.', 'Cost')}</th>${th('margin', L('Маржа', 'Margin'), 'n')}${th('stock', L('Остаток', 'Stock'), 'c')}${arch ? '<th></th>' : `<th class="c">${L('На сайте', 'Live')}</th><th class="w0"></th>`}</tr></thead>
    <tbody>${list.map((p) => {
      const m = p.price ? Math.round(((p.price - p.cost) / p.price) * 100) : 0;
      return `<tr class="clickable ${pr.sel.has(p.id) ? 'sel-row' : ''}" data-edit="${p.id}">
        ${arch ? '' : `<td class="w0"><input type="checkbox" data-sel="${p.id}" ${pr.sel.has(p.id) ? 'checked' : ''} aria-label="${L('Выбрать', 'Select')}"></td>`}
        <td><div class="prod-cell"><img src="${pimg(p)}" alt="" loading="lazy"><div><b>${esc(T(p.name))}</b><small>${esc(p.sku)}${p.tags.includes('new') ? ' · ' + L('новинка', 'new') : ''}${p.tags.includes('hit') ? ' · ' + L('хит', 'bestseller') : ''}</small></div></div></td>
        <td class="hide-md m-hide">${esc(catName(p.cat))}</td>
        <td class="n m-meta" data-l="${L('Цена', 'Price')}">${money(p.price)}${p.old > p.price ? `<s class="muted">${money(p.old)}</s>` : ''}</td>
        <td class="n hide-md m-hide">${money(p.cost)}</td>
        <td class="n m-hide"><span class="${m < 30 ? 'qty-minus' : ''}">${m}%</span></td>
        <td class="c m-r1c3">${stockPill(p)}</td>
        ${arch ? `<td class="w0 m-hide"><button class="b sm" type="button" data-restore="${p.id}"><i class="ph ph-arrow-counter-clockwise"></i>${L('Вернуть', 'Restore')}</button></td>`
        : `<td class="c m-hide"><label class="switch" title="${L('Показывать на сайте', 'Show on the site')}"><input type="checkbox" data-vis="${p.id}" ${p.visible ? 'checked' : ''} aria-label="${L('Показывать на сайте', 'Show on the site')}"></label></td>
        <td class="w0 m-hide"><div style="display:flex;gap:2px"><button class="b ghost icon" type="button" data-receive="${p.id}" title="${L('Приход', 'Receive')}" aria-label="${L('Приход', 'Receive')}"><i class="ph ph-plus-circle"></i></button><button class="b ghost icon" type="button" data-dup="${p.id}" title="${L('Дублировать', 'Duplicate')}" aria-label="${L('Дублировать', 'Duplicate')}"><i class="ph ph-copy"></i></button><button class="b ghost icon danger" type="button" data-del="${p.id}" title="${L('В архив', 'Archive')}" aria-label="${L('В архив', 'Archive')}"><i class="ph ph-trash"></i></button></div></td>`}
      </tr>`;
    }).join('')}</tbody></table></div>` : `<div class="panel"><p class="empty-note">${arch ? L('Архив пуст', 'Archive is empty') : L('Ничего не найдено. Измените фильтры или добавьте товар.', 'Nothing found. Change the filters or add a product.')}</p></div>`;
  if (pr.sel.size) box.insertAdjacentHTML('beforeend', `<div class="bulk" role="region" aria-label="${L('Действия с выбранными', 'Bulk actions')}"><span>${L('Выбрано', 'Selected')}: ${pr.sel.size}</span>
    <button class="b sm" type="button" data-bulk="show"><i class="ph ph-eye"></i>${L('Показать', 'Show')}</button>
    <button class="b sm" type="button" data-bulk="hide"><i class="ph ph-eye-slash"></i>${L('Скрыть', 'Hide')}</button>
    <button class="b sm" type="button" data-bulk="del"><i class="ph ph-archive"></i>${L('В архив', 'Archive')}</button>
    <button class="b sm ghost icon" type="button" data-bulk="clear" aria-label="${L('Снять выделение', 'Clear selection')}"><i class="ph ph-x"></i></button></div>`);
}

async function onClick(e) {
  const t = e.target.closest('button, input, tr');
  if (!t) return;
  const a = t.dataset.act;
  if (a === 'new-product') return openProductSheet(null);
  if (a === 'export-products') return exportProducts();
  if (t.dataset.receive) { e.stopPropagation(); return openStockSheet(t.dataset.receive, 'in'); }
  if (t.dataset.dup) {
    const p = db.product(t.dataset.dup);
    const copy = structuredClone(p);
    delete copy.id; copy.name = [p.name[0] + L(' (копия)', ' (copy)'), (p.name[1] || '') + ' (copy)']; copy.sku = db.nextSku(p.cat); copy.stock = 0; copy.visible = false;
    return openProductSheet(null, copy);
  }
  if (t.dataset.del) return archive([t.dataset.del]);
  if (t.dataset.restore) { const r = await run(() => db.restoreProduct(t.dataset.restore), t); if (r.ok) toast(L('Товар возвращён из архива', 'Product restored')); return; }
  if (t.dataset.sort) { pr.dir = pr.sort === t.dataset.sort ? -pr.dir : 1; pr.sort = t.dataset.sort; return renderTable(); }
  if (t.dataset.vis) { const r = await run(() => db.setVisible([t.dataset.vis], t.checked)); if (r.ok) toast(t.checked ? L('Показан на сайте', 'Now live') : L('Скрыт с сайта', 'Hidden from the site')); else t.checked = !t.checked; return; }
  if (t.dataset.sel) { t.checked ? pr.sel.add(t.dataset.sel) : pr.sel.delete(t.dataset.sel); return renderTable(); }
  if (t.dataset.selall != null) { t.checked ? rows().forEach((p) => pr.sel.add(p.id)) : pr.sel.clear(); return renderTable(); }
  if (t.dataset.bulk) {
    const ids = [...pr.sel];
    if (t.dataset.bulk === 'clear') { pr.sel.clear(); return renderTable(); }
    if (t.dataset.bulk === 'del') return archive(ids);
    const r = await run(() => db.setVisible(ids, t.dataset.bulk === 'show'), t);
    if (r.ok) { pr.sel.clear(); toast(t.dataset.bulk === 'show' ? L('Показаны на сайте', 'Now live') : L('Скрыты с сайта', 'Hidden from the site')); renderTable(); }
    return;
  }
  if (t.tagName === 'TR' && t.dataset.edit && !e.target.closest('button, input, label, a')) openProductSheet(t.dataset.edit);
}

async function archive(ids) {
  const names = ids.map((id) => T(db.product(id)?.name));
  const ok = await confirmBox({
    title: ids.length === 1 ? L(`Убрать «${names[0]}» в архив?`, `Archive “${names[0]}”?`) : L(`Убрать в архив ${ids.length} товаров?`, `Archive ${ids.length} products?`),
    text: L('Товар пропадёт с сайта и из списка. История продаж и склада сохранится, вернуть можно из фильтра «Архив».', 'It disappears from the site and the list. Sales and stock history stay; restore it from the Archive filter.'),
    ok: L('В архив', 'Archive'),
  });
  if (!ok) return;
  const r = await run(() => Promise.all(ids.map((id) => db.archiveProduct(id))));
  if (!r.ok) return;
  pr.sel.clear();
  toast(ids.length === 1 ? L('Товар в архиве', 'Product archived') : L(`В архиве: ${ids.length}`, `Archived: ${ids.length}`), L('Отменить', 'Undo'), () => run(() => Promise.all(ids.map((id) => db.restoreProduct(id)))));
}

function exportProducts() {
  const out = [[L('Артикул', 'SKU'), L('Название', 'Name'), L('Категория', 'Category'), L('Цена', 'Price'), L('Старая цена', 'Was'), L('Себестоимость', 'Cost'), L('Остаток', 'Stock'), L('Порог', 'Threshold'), L('На сайте', 'Live'), L('Ш×Г×В', 'W×D×H'), L('Материалы', 'Materials')]];
  db.products().forEach((p) => out.push([p.sku, T(p.name), catName(p.cat), p.price, p.old || '', p.cost, p.stock, p.min, p.visible ? 1 : 0, p.dims.join('×'), T(p.mat)]));
  download(`tor-products-${stamp()}.csv`, csv(out), 'text/csv');
}

// ——— Редактор товара
let draft = null;

export function openProductSheet(id, base) {
  const p = id ? db.product(id) : null;
  draft = p ? structuredClone(p) : base || {
    name: ['', ''], desc: ['', ''], mat: ['', ''], cat: pr.cat !== 'all' ? pr.cat : db.categories()[0]?.id, sku: '', price: '', old: '', cost: '',
    stock: '', min: 2, lead: 14, dims: ['', '', ''], colors: [['#CDBBA0', 'Песок', 'Sand']], tags: [], imgs: [], visible: true,
  };
  if (!p && !draft.sku) draft.sku = db.nextSku(draft.cat);
  const site = new URL(EN ? '../../en/' : '../', location.href).href;
  const d = sheet(sheetHead(p ? esc(T(p.name)) : L('Новый товар', 'New product'), p ? esc(p.sku) + ' · ' + L('добавлен', 'added') + ' ' + fDate(p.created) : L('Заполните хотя бы название, категорию и цену', 'At least a name, category and price'),
    p && !p.archived ? `<a class="b sm" href="${site}#${p.id}" target="_blank" rel="noopener"><i class="ph ph-arrow-square-out"></i>${L('На сайте', 'View')}</a>` : '') + `
    <form class="sh-body" id="pform" novalidate></form>
    <div class="sh-foot">${p && !p.archived ? `<button class="b danger" type="button" data-act="sheet-del"><i class="ph ph-archive"></i>${L('В архив', 'Archive')}</button>` : ''}<span class="grow"></span>
      <button class="b" type="button" data-close>${L('Отмена', 'Cancel')}</button><button class="b pri" type="submit" form="pform">${p ? L('Сохранить', 'Save') : L('Добавить', 'Add')}</button></div>`);
  renderForm();
  const f = $('#pform', d);
  f.addEventListener('input', onInput);
  f.addEventListener('change', onInput);
  f.addEventListener('click', onFormClick);
  f.addEventListener('submit', (e) => { e.preventDefault(); save(d); });
  f.addEventListener('dragover', (e) => { if (e.target.closest('.imgs')) { e.preventDefault(); $('.img-add', d).classList.add('drag'); } });
  f.addEventListener('dragleave', (e) => { if (e.target.closest('.img-add')) $('.img-add', d).classList.remove('drag'); });
  f.addEventListener('drop', (e) => { if (!e.target.closest('.imgs')) return; e.preventDefault(); $('.img-add', d)?.classList.remove('drag'); addFiles(e.dataTransfer.files); });
  $('[data-act="sheet-del"]', d)?.addEventListener('click', async () => { d.close(); await archive([p.id]); });
  if (!p) setTimeout(() => $('[data-k="name.0"]', d)?.focus(), 60);
}

const marginText = (x) => {
  const m = +x.price ? Math.round(((+x.price - +x.cost) / +x.price) * 100) : null;
  if (m == null) return L('Введите цену и себестоимость — посчитаем маржу.', 'Enter price and cost to see the margin.');
  return L(`Маржа <b>${m}%</b> · прибыль с единицы <b>${money(+x.price - +x.cost)}</b>`, `Margin <b>${m}%</b> · profit per unit <b>${money(+x.price - +x.cost)}</b>`) +
    (+x.old > +x.price ? L(` · скидка <b>${Math.round((1 - x.price / x.old) * 100)}%</b>`, ` · discount <b>${Math.round((1 - x.price / x.old) * 100)}%</b>`) : '');
};

function renderForm() {
  const f = $('#pform');
  const x = draft;
  const isNew = !x.id;
  f.innerHTML = `
    <section class="sec"><h3>${L('Фото', 'Photos')}<small class="muted" style="text-transform:none;letter-spacing:0">${L('первое — обложка', 'first one is the cover')}</small></h3>
      <div class="imgs">${x.imgs.map((im, i) => `<div class="img-tile"><img src="${thumb(im)}" alt="">${i === 0 ? `<span class="main-tag">${L('обложка', 'cover')}</span>` : ''}<div class="img-acts">${i ? `<button type="button" data-img-main="${i}" title="${L('Сделать обложкой', 'Make cover')}" aria-label="${L('Сделать обложкой', 'Make cover')}"><i class="ph ph-star"></i></button>` : ''}<button type="button" data-img-del="${i}" title="${L('Удалить фото', 'Remove photo')}" aria-label="${L('Удалить фото', 'Remove photo')}"><i class="ph ph-trash"></i></button></div></div>`).join('')}
        ${uploading ? `<div class="img-add"><i class="ph ph-spinner spin"></i>${L('Загружаем…', 'Uploading…')}</div>` : ''}
        <label class="img-add"><i class="ph ph-image-square"></i>${L('Загрузить или перетащить', 'Upload or drop')}<input type="file" accept="image/*" multiple data-files></label></div>
      <div class="add-line" style="grid-template-columns:minmax(0,1fr) auto"><input class="in" type="url" data-url placeholder="${L('…или ссылка на фото https://', '…or an image link https://')}"><button class="b" type="button" data-add-url>${L('Добавить', 'Add')}</button></div>
    </section>
    <section class="sec"><h3>${L('Основное', 'Basics')}</h3>
      <div class="row"><label class="fld"><span>${L('Название', 'Name')} RU <em>*</em></span><input class="in" data-k="name.0" value="${esc(x.name[0])}" required></label><label class="fld"><span>${L('Название', 'Name')} EN</span><input class="in" data-k="name.1" value="${esc(x.name[1])}"></label></div>
      <div class="row"><label class="fld"><span>${L('Категория', 'Category')}</span><select class="sel" data-k="cat">${db.categories().map((c) => `<option value="${c.id}" ${x.cat === c.id ? 'selected' : ''}>${esc(T(c.name))}</option>`).join('')}</select></label>
        <label class="fld"><span>${L('Артикул', 'SKU')}</span><input class="in" data-k="sku" value="${esc(x.sku)}"></label></div>
      <div class="chips-a">${[['new', L('Новинка', 'New')], ['hit', L('Хит продаж', 'Bestseller')]].map(([t, n]) => `<label class="chip-a"><input type="checkbox" data-tag="${t}" ${x.tags.includes(t) ? 'checked' : ''}>${n}</label>`).join('')}
        <label class="switch" style="margin-left:auto"><input type="checkbox" data-k="visible" ${x.visible ? 'checked' : ''}>${L('Показывать на сайте', 'Show on the site')}</label></div>
    </section>
    <section class="sec"><h3>${L('Цена', 'Pricing')}</h3>
      <div class="row" style="--c:3"><label class="fld"><span>${L('Цена, ₸', 'Price, ₸')} <em>*</em></span><input class="in" type="number" min="0" step="1000" inputmode="numeric" data-k="price" value="${x.price}"></label>
        <label class="fld"><span>${L('Старая цена', 'Was price')}</span><input class="in" type="number" min="0" step="1000" inputmode="numeric" data-k="old" value="${x.old || ''}" placeholder="${L('для скидки', 'for a sale')}"></label>
        <label class="fld"><span>${L('Себестоимость', 'Unit cost')}</span><input class="in" type="number" min="0" step="500" inputmode="numeric" data-k="cost" value="${x.cost}"></label></div>
      <p class="calc" id="calc">${marginText(x)}</p>
    </section>
    <section class="sec"><h3>${L('Склад', 'Stock')}</h3>
      <div class="row" style="--c:3">${isNew ? `<label class="fld"><span>${L('Начальный остаток', 'Opening stock')}</span><input class="in" type="number" min="0" inputmode="numeric" data-k="stock" value="${x.stock}" placeholder="0"></label>` : `<div class="fld"><span>${L('Остаток сейчас', 'In stock now')}</span><div style="display:flex;gap:8px;align-items:center;height:40px">${stockPill(x)}<button class="b sm" type="button" data-receive-in="${x.id}">${L('Движение', 'Adjust')}</button></div></div>`}
        <label class="fld"><span>${L('Порог «мало»', 'Low threshold')}</span><input class="in" type="number" min="0" inputmode="numeric" data-k="min" value="${x.min}"></label>
        <label class="fld"><span>${L('Под заказ, дней', 'Lead time, days')}</span><input class="in" type="number" min="1" inputmode="numeric" data-k="lead" value="${x.lead}"></label></div>
    </section>
    <section class="sec"><h3>${L('Размеры и материалы', 'Size & materials')}</h3>
      <div class="row" style="--c:3">${[L('Ширина', 'Width'), L('Глубина', 'Depth'), L('Высота', 'Height')].map((n, i) => `<label class="fld"><span>${n}, ${L('см', 'cm')}</span><input class="in" type="number" min="0" inputmode="numeric" data-k="dims.${i}" value="${x.dims[i] ?? ''}"></label>`).join('')}</div>
      <div class="row"><label class="fld"><span>${L('Материалы', 'Materials')} RU</span><input class="in" data-k="mat.0" value="${esc(x.mat[0])}"></label><label class="fld"><span>${L('Материалы', 'Materials')} EN</span><input class="in" data-k="mat.1" value="${esc(x.mat[1])}"></label></div>
      <div class="row r1"><label class="fld"><span>${L('Описание', 'Description')} RU</span><textarea class="ta" data-k="desc.0">${esc(x.desc[0])}</textarea></label></div>
      <div class="row r1"><label class="fld"><span>${L('Описание', 'Description')} EN</span><textarea class="ta" data-k="desc.1">${esc(x.desc[1])}</textarea></label></div>
    </section>
    <section class="sec"><h3>${L('Цвета и обивка', 'Colours & finishes')}<button class="b sm" type="button" data-color-add><i class="ph ph-plus"></i>${L('Цвет', 'Colour')}</button></h3>
      ${x.colors.map((c, i) => `<div class="color-row"><input type="color" data-color="${i}.0" value="${c[0]}" aria-label="${L('Цвет', 'Colour')}"><input class="in" data-color="${i}.1" value="${esc(c[1])}" placeholder="${L('Название RU', 'Name RU')}"><input class="in" data-color="${i}.2" value="${esc(c[2])}" placeholder="${L('Название EN', 'Name EN')}"><button class="b ghost icon" type="button" data-color-del="${i}" aria-label="${L('Убрать цвет', 'Remove colour')}"><i class="ph ph-x"></i></button></div>`).join('') || `<p class="muted">${L('Без вариантов цвета', 'No colour options')}</p>`}
    </section>`;
}

function onInput(e) {
  const el = e.target;
  if (el.dataset.k) {
    const [k, i] = el.dataset.k.split('.');
    const val = el.type === 'checkbox' ? el.checked : el.type === 'number' ? (el.value === '' ? '' : +el.value) : el.value;
    if (i != null) draft[k][+i] = val; else draft[k] = val;
    el.removeAttribute('aria-invalid');
    if (k === 'cat' && !draft.id) { draft.sku = db.nextSku(draft.cat); $('[data-k="sku"]').value = draft.sku; }
    if (['price', 'cost', 'old'].includes(k)) $('#calc').innerHTML = marginText(draft);
  } else if (el.dataset.tag && e.type === 'change') {
    const t = el.dataset.tag;
    draft.tags = el.checked ? [...new Set([...draft.tags, t])] : draft.tags.filter((x) => x !== t);
  } else if (el.dataset.color) {
    const [i, j] = el.dataset.color.split('.');
    draft.colors[+i][+j] = el.value;
  } else if (el.dataset.files != null && e.type === 'change') {
    addFiles(el.files);
  }
}

function onFormClick(e) {
  const b = e.target.closest('button');
  if (!b) return;
  if (b.dataset.imgDel) { draft.imgs.splice(+b.dataset.imgDel, 1); renderForm(); }
  else if (b.dataset.imgMain) { const [im] = draft.imgs.splice(+b.dataset.imgMain, 1); draft.imgs.unshift(im); renderForm(); }
  else if (b.dataset.colorAdd != null) { draft.colors.push(['#A8A39B', '', '']); renderForm(); }
  else if (b.dataset.colorDel) { draft.colors.splice(+b.dataset.colorDel, 1); renderForm(); }
  else if (b.dataset.receiveIn) { b.closest('dialog').close(); openStockSheet(b.dataset.receiveIn, 'in'); }
  else if (b.dataset.addUrl != null) {
    const inp = $('[data-url]');
    const u = inp.value.trim();
    if (!/^https?:\/\/.+/i.test(u)) { inp.setAttribute('aria-invalid', 'true'); toast(L('Нужна ссылка, начинающаяся с https://', 'Link must start with https://')); return; }
    draft.imgs.push(u); renderForm();
  }
}

// Фото сжимаем до 1400 px и отправляем в хранилище (в демо — прямо в браузер)
let uploading = 0;
async function addFiles(files) {
  const list = [...files].filter((f) => f.type.startsWith('image/')).slice(0, 8);
  uploading += list.length; renderForm();
  for (const file of list) {
    try {
      const bmp = await createImageBitmap(file);
      const k = Math.min(1, (db.MODE === 'remote' ? 1400 : 1000) / Math.max(bmp.width, bmp.height));
      const c = document.createElement('canvas');
      c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
      c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
      let blob = await new Promise((r) => c.toBlob(r, 'image/webp', 0.82));
      if (!blob || blob.type !== 'image/webp') blob = await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.84));
      const url = await db.uploadImage(blob);
      draft.imgs.push(url);
    } catch (err) { toast(db.humanError(err) + ' — ' + file.name); }
    uploading--; if ($('#pform')) renderForm();
  }
}

async function save(d) {
  const x = draft;
  const bad = [];
  if (!String(x.name[0]).trim()) bad.push('name.0');
  if (!(+x.price > 0)) bad.push('price');
  if (bad.length) {
    bad.forEach((k) => $(`[data-k="${k}"]`)?.setAttribute('aria-invalid', 'true'));
    $(`[data-k="${bad[0]}"]`).focus();
    toast(L('Заполните название и цену', 'Fill in the name and price'));
    return;
  }
  if (uploading) { toast(L('Дождитесь загрузки фото', 'Wait for the photos to upload')); return; }
  const clean = {
    ...x, name: [x.name[0].trim(), (x.name[1] || '').trim()], price: +x.price, old: +x.old > +x.price ? +x.old : 0, cost: +x.cost || 0,
    min: +x.min || 0, lead: +x.lead || 14, dims: x.dims.map((n) => +n || 0), colors: x.colors.filter((c) => c[1] || c[2]),
    sku: String(x.sku).trim() || db.nextSku(x.cat), stock: +x.stock || 0, desc: [x.desc[0] || '', x.desc[1] || ''], mat: [x.mat[0] || '', x.mat[1] || ''],
  };
  const r = await run(() => db.saveProduct(clean), $('.sh-foot [type="submit"]', d));
  if (!r.ok) return;
  d.close();
  toast(x.id ? L('Сохранено', 'Saved') : L(`Добавлено: ${T(clean.name)}`, `Added: ${T(clean.name)}`));
}
