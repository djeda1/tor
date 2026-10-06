// Настройки: доставка, команда и доступы, уведомления, выгрузки, обслуживание базы.
import * as db from '../db.js';
import { $, L, esc, fDate, toast, run, confirmBox, download, stamp } from './ui.js';

export function render(v) {
  const s = db.settings();
  const remote = db.MODE === 'remote';
  const meInfo = db.me();
  const owner = meInfo?.role === 'owner';
  let sound = true; try { sound = localStorage.getItem('tor:sound') !== 'off'; } catch (e) {}
  const perm = 'Notification' in window ? Notification.permission : 'unsupported';
  v.innerHTML = `<div class="page-head"><h1>${L('Настройки', 'Settings')}<small>${esc(db.info().label)}${db.info().host ? ' · ' + esc(db.info().host) : ''}</small></h1></div>
    <div class="settings">
      <form class="sec" id="setDelivery"><h3>${L('Доставка', 'Delivery')}</h3>
        <div class="row"><label class="fld"><span>${L('Бесплатно от, ₸', 'Free from, ₸')}</span><input class="in" type="number" min="0" step="10000" name="freeDelivery" value="${s.freeDelivery}"></label><label class="fld"><span>${L('Иначе стоимость, ₸', 'Otherwise, ₸')}</span><input class="in" type="number" min="0" step="500" name="deliveryFee" value="${s.deliveryFee}"></label></div>
        <div class="acts"><button class="b pri" type="submit">${L('Сохранить', 'Save')}</button></div></form>

      <section class="sec"><h3>${L('Уведомления о новых заказах', 'New order alerts')}</h3>
        <p>${L('Пока панель открыта, новые заказы с сайта появляются сразу — со звуком и всплывающим сообщением.', 'While the panel is open, new website orders appear instantly, with a sound and a pop-up.')}</p>
        <div class="acts"><label class="switch"><input type="checkbox" id="soundOn" ${sound ? 'checked' : ''}>${L('Звуковой сигнал', 'Sound')}</label>
          ${perm === 'default' ? `<button class="b" type="button" data-act="notif"><i class="ph ph-bell-ringing"></i>${L('Включить уведомления браузера', 'Enable browser notifications')}</button>` : perm === 'granted' ? `<span class="pill ok">${L('Уведомления браузера включены', 'Browser notifications on')}</span>` : perm === 'denied' ? `<span class="pill warn">${L('Уведомления запрещены в настройках браузера', 'Notifications blocked in browser settings')}</span>` : ''}</div></section>

      ${remote ? `<section class="sec"><h3>${L('Команда', 'Team')}</h3>
        <p>${L('Кто может входить в панель. Новый сотрудник открывает панель, выбирает «Первый вход» и придумывает пароль для указанного здесь email.', 'Who can sign in. A new team member opens the panel, picks “First sign-in” and sets a password for the email listed here.')}</p>
        <ul class="alist team">${db.admins().map((a) => `<li><span class="avatar">${esc((a.name || a.email)[0].toUpperCase())}</span><div><p class="al-name">${esc(a.name || a.email)}${a.email === meInfo?.email ? ` <span class="muted">(${L('вы', 'you')})</span>` : ''}</p><p class="al-sub">${esc(a.email)} · ${a.role === 'owner' ? L('владелец', 'owner') : L('менеджер', 'manager')} · ${L('с', 'since')} ${fDate(Date.parse(a.created_at))}</p></div>
          ${owner && a.email !== meInfo?.email ? `<button class="b sm danger" type="button" data-rm="${esc(a.email)}">${L('Убрать', 'Remove')}</button>` : '<span></span>'}</li>`).join('')}</ul>
        ${owner ? `<form class="row" id="addAdmin" style="--c:4;align-items:end"><label class="fld"><span>Email</span><input class="in" type="email" name="email" required placeholder="manager@mail.kz"></label><label class="fld"><span>${L('Имя', 'Name')}</span><input class="in" name="name" placeholder="${L('Айгерим', 'Aigerim')}"></label>
          <label class="fld"><span>${L('Роль', 'Role')}</span><select class="sel" name="role"><option value="manager">${L('Менеджер', 'Manager')}</option><option value="owner">${L('Владелец', 'Owner')}</option></select></label><button class="b pri" type="submit"><i class="ph ph-user-plus"></i>${L('Добавить', 'Add')}</button></form>`
        : `<p class="muted">${L('Добавлять сотрудников может только владелец.', 'Only the owner can add team members.')}</p>`}</section>`
      : `<form class="sec" id="setPin"><h3>${L('PIN-код входа (демо)', 'Login PIN (demo)')}</h3>
        <div class="row"><label class="fld"><span>${L('Новый PIN (4 цифры)', 'New PIN (4 digits)')}</span><input class="in" name="pin" inputmode="numeric" maxlength="4" pattern="\\d{4}" autocomplete="off"></label><span></span></div>
        <div class="acts"><button class="b" type="submit">${L('Сменить PIN', 'Change PIN')}</button></div></form>`}

      <section class="sec"><h3>${L('Выгрузки', 'Exports')}</h3>
        <p>${remote ? L('Копия всех данных в JSON для бухгалтерии или переноса. Сама база ежедневно копируется Supabase.', 'A JSON copy of all data for accounting or migration. Supabase also backs the database up daily.') : L('Все данные хранятся в этом браузере. Скачивайте копию после важных изменений.', 'All data lives in this browser. Download a backup after important changes.')}</p>
        <div class="acts"><button class="b ink" type="button" data-act="backup"><i class="ph ph-download-simple"></i>${L('Скачать копию (JSON)', 'Download backup (JSON)')}</button>
          ${remote ? '' : `<label class="b"><i class="ph ph-upload-simple"></i>${L('Загрузить копию', 'Restore backup')}<input type="file" accept="application/json,.json" id="restore" hidden></label>`}</div></section>

      <section class="sec"><h3>${remote ? L('Тестовые данные', 'Test data') : L('Демо-данные', 'Demo data')}</h3>
        <p>${remote ? L('Удалить все заказы и статистику посещений — например, после тестовых заказов перед запуском. Каталог останется, а товар из удалённых заказов вернётся на склад.', 'Delete all orders and visit stats — e.g. after test orders before launch. The catalogue stays; stock from deleted orders goes back.') : L('Вернуть стартовый каталог из 36 товаров и историю продаж за 30 дней. Все ваши изменения пропадут.', 'Restore the original 36-item catalogue and 30 days of history. All your changes will be lost.')}</p>
        <div class="acts"><button class="b danger" type="button" data-act="wipe" ${remote && !owner ? 'disabled' : ''}><i class="ph ph-arrow-counter-clockwise"></i>${remote ? L('Очистить заказы и статистику', 'Clear orders and stats') : L('Сбросить к демо', 'Reset to demo')}</button>${remote && !owner ? `<span class="muted">${L('только владелец', 'owner only')}</span>` : ''}</div></section>

      ${remote ? '' : `<section class="sec"><h3>${L('Подключить базу данных', 'Connect a database')}</h3><p>${L('Сейчас это демо: данные живут только в этом браузере. Чтобы заказы видели все сотрудники, укажите проект Supabase в js/config.js — инструкция в supabase/README.md.', 'This is a demo: data lives only in this browser. To share orders with the whole team, set your Supabase project in js/config.js — see supabase/README.md.')}</p></section>`}
    </div>`;

  $('#setDelivery', v).addEventListener('submit', async (e) => {
    e.preventDefault();
    const r = await run(() => db.setSettings({ freeDelivery: +e.target.freeDelivery.value || 0, deliveryFee: +e.target.deliveryFee.value || 0 }), e.target.querySelector('button'));
    if (r.ok) toast(L('Сохранено', 'Saved'));
  });
  $('#soundOn', v).addEventListener('change', (e) => { try { localStorage.setItem('tor:sound', e.target.checked ? 'on' : 'off'); } catch (err) {} });
  $('#setPin', v)?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const pin = e.target.pin.value;
    if (!/^\d{4}$/.test(pin)) { e.target.pin.setAttribute('aria-invalid', 'true'); toast(L('PIN — ровно 4 цифры', 'PIN must be exactly 4 digits')); return; }
    const r = await run(() => db.setSettings({ pin }));
    if (r.ok) { e.target.reset(); toast(L('PIN изменён', 'PIN changed')); }
  });
  $('#addAdmin', v)?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.target;
    const r = await run(() => db.addAdmin(f.email.value, f.role.value, f.name.value.trim()), f.querySelector('button'));
    if (r.ok) toast(L('Добавлен. Пусть откроет панель и выберет «Первый вход».', 'Added. Ask them to open the panel and pick “First sign-in”.'), null, null, 6000);
  });
  $('#restore', v)?.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (!(await confirmBox({ title: L('Заменить все данные копией?', 'Replace all data with the backup?'), text: file.name, ok: L('Заменить', 'Replace') }))) return;
    const r = await run(async () => db.importJSON(await file.text()));
    if (r.ok) toast(L('Данные восстановлены', 'Data restored'));
  });
  v.onclick = async (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.act === 'backup') { const r = await run(() => db.exportJSON(), b); if (r.ok) download(`tor-backup-${stamp()}.json`, r.value, 'application/json'); }
    if (b.dataset.act === 'notif') { await Notification.requestPermission(); render(v); }
    if (b.dataset.rm) {
      if (!(await confirmBox({ title: L(`Закрыть доступ для ${b.dataset.rm}?`, `Remove access for ${b.dataset.rm}?`), ok: L('Убрать', 'Remove') }))) return;
      const r = await run(() => db.removeAdmin(b.dataset.rm), b);
      if (r.ok) toast(L('Доступ закрыт', 'Access removed'));
    }
    if (b.dataset.act === 'wipe') {
      const ok = await confirmBox(remote
        ? { title: L('Удалить все заказы и статистику?', 'Delete all orders and stats?'), text: L('Это нельзя отменить. Каталог и категории останутся.', 'This cannot be undone. Catalogue and categories stay.'), ok: L('Удалить', 'Delete') }
        : { title: L('Сбросить все данные?', 'Reset all data?'), text: L('Каталог, заказы и склад вернутся к демо-версии.', 'Catalogue, orders and stock go back to the demo.'), ok: L('Сбросить', 'Reset') });
      if (!ok) return;
      const r = await run(() => db.wipe(), b);
      if (r.ok) toast(remote ? L('Заказы и статистика удалены', 'Orders and stats deleted') : L('Демо-данные восстановлены', 'Demo data restored'));
    }
  };
}
