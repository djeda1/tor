// Категории: названия RU/EN, порядок на сайте, удаление с переносом товаров.
import * as db from '../db.js';
import { $, $$, L, T, esc, plural, toast, run, confirmBox } from './ui.js';
import { setCatFilter } from './products.js';

export function render(v) {
  const cats = db.categories();
  v.innerHTML = `<div class="page-head"><h1>${L('Категории', 'Categories')}<small>${L('Порядок здесь = порядок на сайте', 'Order here = order on the site')}</small></h1></div>
    <div class="cat-list">${cats.map((c, i) => {
      const n = db.products().filter((p) => p.cat === c.id).length;
      return `<div class="cat-row" data-cid="${c.id}"><span class="idx">${String(i + 1).padStart(2, '0')}</span>
        <input class="in" data-cname="0" value="${esc(c.name[0])}" aria-label="${L('Название RU', 'Name RU')}"><input class="in" data-cname="1" value="${esc(c.name[1])}" aria-label="${L('Название EN', 'Name EN')}">
        <a class="muted" href="#/products" data-catlink="${c.id}">${n} ${L(plural(n, 'товар', 'товара', 'товаров'), n === 1 ? 'item' : 'items')}</a>
        <div class="acts"><button class="b ghost icon" type="button" data-cmove="-1" ${i ? '' : 'disabled'} aria-label="${L('Выше', 'Up')}"><i class="ph ph-arrow-up"></i></button><button class="b ghost icon" type="button" data-cmove="1" ${i < cats.length - 1 ? '' : 'disabled'} aria-label="${L('Ниже', 'Down')}"><i class="ph ph-arrow-down"></i></button><button class="b ghost icon danger" type="button" data-cdel aria-label="${L('Удалить', 'Delete')}"><i class="ph ph-trash"></i></button></div></div>`;
    }).join('')}
    <form class="cat-row" id="catAdd"><span class="idx">+</span><input class="in" name="ru" placeholder="${L('Новая категория RU', 'New category RU')}" required><input class="in" name="en" placeholder="${L('EN (необязательно)', 'EN (optional)')}"><span></span><button class="b pri" type="submit"><i class="ph ph-plus"></i>${L('Добавить', 'Add')}</button></form></div>`;
  $$('[data-cname]', v).forEach((inp) => inp.addEventListener('change', async () => {
    const c = db.category(inp.closest('[data-cid]').dataset.cid);
    const name = [...c.name]; name[+inp.dataset.cname] = inp.value.trim();
    if (!name[0]) { inp.value = c.name[0]; return; }
    const r = await run(() => db.saveCategory({ id: c.id, name }));
    if (r.ok) toast(L('Сохранено', 'Saved'));
  }));
  $('#catAdd', v).addEventListener('submit', async (e) => {
    e.preventDefault();
    const ru = e.target.ru.value.trim();
    if (!ru) return;
    const r = await run(() => db.saveCategory({ name: [ru, e.target.en.value.trim() || ru] }), e.target.querySelector('button'));
    if (r.ok) toast(L('Категория добавлена', 'Category added'));
  });
  v.onclick = async (e) => {
    const t = e.target.closest('button, a');
    if (!t) return;
    if (t.dataset.catlink) return setCatFilter(t.dataset.catlink);
    if (t.dataset.cmove) return run(() => db.moveCategory(t.closest('[data-cid]').dataset.cid, +t.dataset.cmove), t);
    if (t.dataset.cdel != null) return remove(t.closest('[data-cid]').dataset.cid);
  };
}

async function remove(id) {
  const c = db.category(id);
  const n = [...db.products(), ...db.archived()].filter((p) => p.cat === id).length;
  const others = db.categories().filter((x) => x.id !== id);
  if (!others.length) { toast(L('Нельзя удалить последнюю категорию', 'Cannot delete the last category')); return; }
  const res = await confirmBox({
    title: L(`Удалить «${T(c.name)}»?`, `Delete “${T(c.name)}”?`),
    text: n ? L(`В категории ${n} ${plural(n, 'товар', 'товара', 'товаров')}. Куда их перенести?`, `It has ${n} product(s). Move them to:`) : '',
    extra: n ? `<select class="sel" id="moveTo">${others.map((x) => `<option value="${x.id}">${esc(T(x.name))}</option>`).join('')}</select>` : '',
  });
  if (!res) return;
  const to = n ? $('#moveTo', res).value : others[0].id;
  const r = await run(() => db.removeCategory(id, to));
  if (r.ok) toast(L('Категория удалена', 'Category deleted'));
}
