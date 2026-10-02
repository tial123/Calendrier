import {
  MONTHS, WEEKDAYS, addDays, addMinutes, formatDuration, formatLongDate, formatShortDate,
  formatTime, monthGrid, pad, parseKey, relativeDay, startOfWeek, todayKey, weekday,
} from './dates.js';
import { REPEATS, durationMinutes, isOvernight, occurrencesOn, summarizeRange } from './events.js';
import { PALETTE, createStore, parseBackup } from './store.js';

const UPCOMING_DAYS = 90;

const store = createStore();
const app = document.getElementById('app');
const sheetRoot = document.getElementById('sheet');
const actionRoot = document.getElementById('actions');
const toastEl = document.getElementById('toast');

const monthOf = (key) => {
  const { y, m } = parseKey(key);
  return { y, m };
};
const sameMonth = (a, b) => a.y === b.y && a.m === b.m;

const startDay = todayKey();
const ui = {
  tab: 'calendar',
  today: startDay,
  selected: startDay,
  month: monthOf(startDay),
  filter: 'all',
  slide: '',
};

// ---------------------------------------------------------------- helpers

const ICONS = {
  left: '<path d="M15 18l-6-6 6-6"/>',
  right: '<path d="M9 18l6-6-6-6"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  calendar: '<rect x="3" y="4.5" width="18" height="16.5" rx="3.5"/><path d="M3 10h18M8 2.5v4M16 2.5v4"/>',
  list: '<path d="M9 6h11M9 12h11M9 18h11M4.5 6h.01M4.5 12h.01M4.5 18h.01"/>',
  sliders: '<path d="M4 7h9M18 7h2M4 17h3M12 17h8"/><circle cx="15.5" cy="7" r="2.5"/><circle cx="9.5" cy="17" r="2.5"/>',
  repeat: '<path d="M17 2l3 3-3 3"/><path d="M4 11V9a4 4 0 0 1 4-4h12"/><path d="M7 22l-3-3 3-3"/><path d="M20 13v2a4 4 0 0 1-4 4H4"/>',
  chevron: '<path d="M9 6l6 6-6 6"/>',
};

const icon = (name, cls = 'icon') =>
  `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name]}</svg>`;

const esc = (value) => String(value).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
const fmt = (time) => formatTime(time, store.state.settings.use24h);

function tint(hex, alpha) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${alpha})`;
}
const catVars = (color) => `--c:${color};--c-soft:${tint(color, 0.13)};--c-soft-dark:${tint(color, 0.24)}`;

const isStandalone = () => window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;

// ---------------------------------------------------------------- views

function eventCard(o) {
  const cat = store.category(o.categoryId);
  let when = 'All day';
  if (!o.allDay) {
    const nextDay = isOvernight(o) ? '<sup>+1</sup>' : '';
    when = `${fmt(o.start)} – ${fmt(o.end)}${nextDay} · ${formatDuration(durationMinutes(o))}`;
  }
  const repeat = o.repeat !== 'none' ? icon('repeat', 'meta-icon') : '';
  return `
    <button class="event" data-action="open-event" data-id="${o.id}" data-on="${o.on}" style="${catVars(cat.color)}">
      <span class="event-body">
        <span class="event-title">${esc(o.title || cat.name)}</span>
        <span class="event-meta">${when}${repeat}</span>
        ${o.notes ? `<span class="event-notes">${esc(o.notes)}</span>` : ''}
      </span>
      <span class="event-tag">${esc(cat.name)}</span>
    </button>`;
}

function calendarView() {
  const { y, m } = ui.month;
  const { weekStart } = store.state.settings;
  const { events } = store.state;
  const letters = Array.from({ length: 7 }, (_, i) => WEEKDAYS[(i + weekStart) % 7][0]);

  const cells = monthGrid(y, m, weekStart).map((key) => {
    const { m: month, d } = parseKey(key);
    const occ = occurrencesOn(events, key);
    const colors = [...new Set(occ.map((o) => store.category(o.categoryId).color))].slice(0, 3);
    const cls = ['day', month !== m && 'outside', key === ui.today && 'today', key === ui.selected && 'selected']
      .filter(Boolean).join(' ');
    const label = formatLongDate(key) + (occ.length ? `, ${plural(occ.length, 'event')}` : '');
    return `
      <button class="${cls}" data-action="select-day" data-key="${key}" aria-label="${label}"
        ${key === ui.today ? 'aria-current="date"' : ''} aria-pressed="${key === ui.selected}">
        <span class="num">${d}</span>
        <span class="dots">${colors.map((c) => `<i style="background:${c}"></i>`).join('')}</span>
      </button>`;
  }).join('');

  const slide = ui.slide ? ` slide-${ui.slide}` : '';
  ui.slide = '';

  return `
    <section class="view">
      <header class="topbar">
        <div class="title-wrap">
          <p class="eyebrow">${y}</p>
          <h1 class="title" aria-label="${MONTHS[m]} ${y}">${MONTHS[m]}</h1>
        </div>
        <div class="month-nav">
          <button class="icon-btn" data-action="shift-month" data-step="-1" aria-label="Previous month">${icon('left')}</button>
          <button class="today-btn" data-action="today">Today</button>
          <button class="icon-btn" data-action="shift-month" data-step="1" aria-label="Next month">${icon('right')}</button>
        </div>
      </header>
      <div class="weekdays" aria-hidden="true">${letters.map((l) => `<span>${l}</span>`).join('')}</div>
      <div class="month${slide}" id="month">${cells}</div>
      <div class="agenda" data-scroll="calendar:${ui.selected}">${agenda()}</div>
    </section>`;
}

function agenda() {
  const occ = occurrencesOn(store.state.events, ui.selected);
  const relative = relativeDay(ui.selected, ui.today);
  const title = relative ?? formatLongDate(ui.selected, parseKey(ui.selected).y !== parseKey(ui.today).y);
  const details = [relative && formatLongDate(ui.selected, false), occ.length && plural(occ.length, 'event')]
    .filter(Boolean).join(' · ');

  const body = occ.length
    ? `<div class="event-list">${occ.map(eventCard).join('')}</div>`
    : `<div class="empty">
         <p>Nothing planned</p>
         <button class="link-btn" data-action="new-event">Add an event</button>
       </div>`;

  return `
    <div class="agenda-head">
      <h2>${title}</h2>
      ${details ? `<p>${details}</p>` : ''}
    </div>
    ${body}`;
}

function upcomingView() {
  const { events, categories, settings } = store.state;
  const weekStart = startOfWeek(ui.today, settings.weekStart);
  const totals = summarizeRange(events, weekStart, 7);

  const tiles = categories.filter((c) => totals.has(c.id)).map((c) => {
    const { count, minutes } = totals.get(c.id);
    const value = minutes ? formatDuration(minutes) : count;
    const sub = minutes ? plural(count, 'event') : count === 1 ? 'event' : 'events';
    return `
      <div class="tile" style="${catVars(c.color)}">
        <div class="tile-name"><i></i>${esc(c.name)}</div>
        <div class="tile-value">${value}</div>
        <div class="tile-sub">${sub}</div>
      </div>`;
  }).join('');

  const chips = [{ id: 'all', name: 'All', color: null }, ...categories].map((c) => `
    <button class="chip${c.color ? '' : ' chip-all'}${ui.filter === c.id ? ' on' : ''}" data-action="filter" data-id="${c.id}"
      ${c.color ? `style="${catVars(c.color)}"` : ''} aria-pressed="${ui.filter === c.id}">
      ${c.color ? '<i></i>' : ''}${esc(c.name)}
    </button>`).join('');

  const groups = [];
  for (let i = 0; i < UPCOMING_DAYS; i++) {
    const key = addDays(ui.today, i);
    let occ = occurrencesOn(events, key);
    if (ui.filter !== 'all') occ = occ.filter((o) => o.categoryId === ui.filter);
    if (!occ.length) continue;
    const relative = relativeDay(key, ui.today);
    const label = relative
      ? `${relative} <span>${formatLongDate(key, false)}</span>`
      : `${WEEKDAYS[weekday(key)]} <span>${formatShortDate(key)}</span>`;
    groups.push(`
      <div class="day-group">
        <h3 class="day-label">${label}</h3>
        <div class="event-list">${occ.map(eventCard).join('')}</div>
      </div>`);
  }

  return `
    <section class="view">
      <header class="topbar"><h1 class="title">Upcoming</h1></header>
      <div class="scroll" data-scroll="upcoming:${ui.filter}">
        <p class="section-label">This week · ${formatShortDate(weekStart)} – ${formatShortDate(addDays(weekStart, 6))}</p>
        ${tiles ? `<div class="summary">${tiles}</div>` : '<p class="muted pad">Nothing scheduled this week yet.</p>'}
        <div class="chips filter-chips" role="toolbar" aria-label="Filter by category">${chips}</div>
        ${groups.length ? groups.join('') : `
          <div class="empty">
            <p>No upcoming events</p>
            <button class="link-btn" data-action="new-event">Add an event</button>
          </div>`}
        ${groups.length ? `<p class="muted pad center">Showing the next ${UPCOMING_DAYS} days</p>` : ''}
      </div>
    </section>`;
}

function segmented(key, value, options) {
  return `
    <div class="segmented" role="radiogroup">
      ${options.map(([v, label]) => `
        <button class="${v === value ? 'on' : ''}" data-action="setting" data-key="${key}" data-value="${v}"
          role="radio" aria-checked="${v === value}">${label}</button>`).join('')}
    </div>`;
}

function settingsView() {
  const { categories, events, settings } = store.state;
  const rows = categories.map((c) => {
    const count = events.filter((e) => e.categoryId === c.id).length;
    return `
      <button class="row" data-action="edit-category" data-id="${c.id}">
        <span class="row-label"><i class="dot" style="background:${c.color}"></i>${esc(c.name)}</span>
        <span class="row-value">${count || ''}${icon('chevron', 'row-chevron')}</span>
      </button>`;
  }).join('');

  return `
    <section class="view grouped">
      <header class="topbar"><h1 class="title">Settings</h1></header>
      <div class="scroll" data-scroll="settings">
        <p class="group-label">Categories</p>
        <div class="group">
          ${rows}
          <button class="row tint" data-action="new-category">${icon('plus', 'row-icon')}Add Category</button>
        </div>

        <p class="group-label">Calendar</p>
        <div class="group">
          <div class="row"><span>Week starts on</span>${segmented('weekStart', settings.weekStart, [[0, 'Sun'], [1, 'Mon']])}</div>
          <div class="row"><span>Time format</span>${segmented('use24h', settings.use24h, [[false, '12h'], [true, '24h']])}</div>
        </div>

        <p class="group-label">Backup</p>
        <div class="group">
          <button class="row tint" data-action="export">Export Backup</button>
          <label class="row tint">Restore from Backup<input type="file" accept="application/json,.json" data-import hidden></label>
        </div>
        <p class="group-foot">Your calendar is saved on this device only. Export a backup now and then to keep it safe.</p>

        ${isStandalone() ? '' : `
          <p class="group-label">Install</p>
          <div class="group"><p class="row-text">Open this page in Safari, tap the Share button, then <strong>Add to Home Screen</strong>. It will open full-screen and work offline.</p></div>`}

        <div class="group">
          <button class="row destructive center" data-action="reset">Erase All Data</button>
        </div>
      </div>
    </section>`;
}

function tabBar() {
  const tabs = [['calendar', 'Calendar', 'calendar'], ['upcoming', 'Upcoming', 'list'], ['settings', 'Settings', 'sliders']];
  return `
    <nav class="tabbar">
      ${tabs.map(([id, label, ic]) => `
        <button class="tab${ui.tab === id ? ' active' : ''}" data-action="tab" data-tab="${id}"
          ${ui.tab === id ? 'aria-current="page"' : ''}>${icon(ic)}<span>${label}</span></button>`).join('')}
    </nav>`;
}

function render() {
  // Keep the list where it was when re-rendering the same screen (e.g. after editing an event).
  const scroller = app.querySelector('[data-scroll]');
  const saved = scroller ? { key: scroller.dataset.scroll, top: scroller.scrollTop } : null;

  const view = { calendar: calendarView, upcoming: upcomingView, settings: settingsView }[ui.tab]();
  app.innerHTML = `
    ${view}
    ${ui.tab === 'settings' ? '' : `<button class="fab" data-action="new-event" aria-label="New event">${icon('plus')}</button>`}
    ${tabBar()}`;

  const next = app.querySelector('[data-scroll]');
  if (next && saved && next.dataset.scroll === saved.key) next.scrollTop = saved.top;
}

// ---------------------------------------------------------------- navigation

function showMonth(month) {
  if (sameMonth(month, ui.month)) return;
  ui.slide = month.y * 12 + month.m > ui.month.y * 12 + ui.month.m ? 'next' : 'prev';
  ui.month = month;
}

function shiftMonth(step) {
  const index = ui.month.y * 12 + ui.month.m + step;
  const month = { y: Math.floor(index / 12), m: ((index % 12) + 12) % 12 };
  showMonth(month);
  ui.selected = sameMonth(month, monthOf(ui.today)) ? ui.today : `${month.y}-${pad(month.m + 1)}-01`;
  render();
}

function selectDay(key) {
  ui.selected = key;
  showMonth(monthOf(key));
  render();
}

function refreshToday() {
  const today = todayKey();
  if (today === ui.today) return;
  if (ui.selected === ui.today) ui.selected = today;
  ui.today = today;
  render();
}

// ---------------------------------------------------------------- sheets & dialogs

let sheetHandlers = {};

function openSheet(html, handlers) {
  sheetHandlers = handlers;
  sheetRoot.innerHTML = `<div class="backdrop" data-sheet="cancel"></div><div class="sheet" role="dialog" aria-modal="true">${html}</div>`;
  sheetRoot.hidden = false;
  requestAnimationFrame(() => requestAnimationFrame(() => sheetRoot.classList.add('visible')));
  return sheetRoot.querySelector('.sheet');
}

function closeSheet() {
  sheetHandlers = {};
  sheetRoot.classList.remove('visible');
  setTimeout(() => {
    if (sheetRoot.classList.contains('visible')) return;
    sheetRoot.hidden = true;
    sheetRoot.innerHTML = '';
  }, 320);
}

sheetRoot.addEventListener('click', (e) => {
  const el = e.target.closest('[data-sheet]');
  if (!el) return;
  const name = el.dataset.sheet;
  const handler = sheetHandlers[name] ?? (name === 'cancel' ? closeSheet : null);
  handler?.(el);
});

/** iOS-style action sheet. Resolves with the chosen action's value, or null when cancelled. */
function actionSheet({ message = '', actions }) {
  return new Promise((resolve) => {
    actionRoot.innerHTML = `
      <div class="backdrop" data-i="-1"></div>
      <div class="actions" role="dialog" aria-modal="true">
        <div class="action-group">
          ${message ? `<p class="action-message">${esc(message)}</p>` : ''}
          ${actions.map((a, i) => `<button data-i="${i}" class="${a.destructive ? 'destructive' : ''}">${esc(a.label)}</button>`).join('')}
        </div>
        <button class="action-cancel" data-i="-1">Cancel</button>
      </div>`;
    actionRoot.hidden = false;
    requestAnimationFrame(() => requestAnimationFrame(() => actionRoot.classList.add('visible')));
    actionRoot.onclick = (e) => {
      const el = e.target.closest('[data-i]');
      if (!el) return;
      const i = Number(el.dataset.i);
      actionRoot.onclick = null;
      actionRoot.classList.remove('visible');
      setTimeout(() => {
        actionRoot.hidden = true;
        actionRoot.innerHTML = '';
      }, 280);
      resolve(i >= 0 ? actions[i].value : null);
    };
  });
}

let toastTimer;
function toast(message) {
  toastEl.textContent = message;
  toastEl.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove('show'), 2400);
}

// ---------------------------------------------------------------- event editor

function blankDraft() {
  const date = ui.tab === 'calendar' ? ui.selected : ui.today;
  let start = '09:00';
  if (date === ui.today) {
    const nextHour = new Date().getHours() + 1;
    start = nextHour < 24 ? `${pad(nextHour)}:00` : '23:00';
  }
  return {
    title: '', categoryId: store.state.categories[0].id, date, allDay: false,
    start, end: addMinutes(start, 60), repeat: 'none', until: null, exceptions: [], notes: '',
  };
}

/**
 * Opens the editor. `source` is the stored event being edited (null for a new one) and `on` is the
 * date of the occurrence that was tapped. With `duplicate`, `source` only pre-fills a new event.
 */
function openEditor(source = null, on = null, duplicate = false) {
  const isNew = !source || duplicate;
  const draft = source ? { ...source, date: on ?? source.date } : blankDraft();
  let categoryId = store.category(draft.categoryId).id;
  let timesTouched = Boolean(source);
  let prevStart = draft.start;

  const chips = store.state.categories.map((c) => `
    <button type="button" class="chip${c.id === categoryId ? ' on' : ''}" data-sheet="category" data-cat="${c.id}"
      style="${catVars(c.color)}" role="radio" aria-checked="${c.id === categoryId}"><i></i>${esc(c.name)}</button>`).join('');

  const sheet = openSheet(`
    <div class="sheet-head">
      <button class="text-btn" data-sheet="cancel">Cancel</button>
      <h3>${isNew ? 'New Event' : 'Edit Event'}</h3>
      <button class="text-btn strong" data-sheet="save">${isNew ? 'Add' : 'Done'}</button>
    </div>
    <form class="sheet-body" novalidate>
      <div class="group">
        <input class="field" name="title" placeholder="Title" value="${esc(draft.title)}" maxlength="200"
          autocomplete="off" enterkeyhint="done">
      </div>
      <div class="group">
        <div class="chips" role="radiogroup" aria-label="Category">${chips}</div>
      </div>
      <div class="group">
        <label class="row"><span>All-day</span><input type="checkbox" class="switch" name="allDay" ${draft.allDay ? 'checked' : ''}></label>
        <label class="row"><span>Date</span><input type="date" name="date" value="${draft.date}"></label>
        <label class="row timed"><span>Starts</span><input type="time" name="start" value="${draft.start}"></label>
        <label class="row timed"><span>Ends</span><span class="row-end"><span class="hint" data-hint></span><input type="time" name="end" value="${draft.end}"></span></label>
      </div>
      <div class="group">
        <label class="row"><span>Repeat</span>
          <select name="repeat">${REPEATS.map((r) => `<option value="${r.value}" ${r.value === draft.repeat ? 'selected' : ''}>${r.label}</option>`).join('')}</select>
        </label>
        <label class="row repeat-only"><span>End repeat</span>
          <select name="endRepeat">
            <option value="never">Never</option>
            <option value="on" ${draft.until ? 'selected' : ''}>On date</option>
          </select>
        </label>
        <label class="row until-only"><span>End date</span><input type="date" name="until" value="${draft.until ?? ''}"></label>
      </div>
      <div class="group">
        <textarea class="field" name="notes" rows="3" placeholder="Notes">${esc(draft.notes)}</textarea>
      </div>
      ${isNew ? '' : `
        <div class="group"><button type="button" class="row tint center" data-sheet="duplicate">Duplicate Event</button></div>
        <div class="group"><button type="button" class="row destructive center" data-sheet="delete">Delete Event</button></div>`}
    </form>`, {
    save: () => save(),
    delete: () => remove(),
    duplicate: () => openEditor({ ...readForm(), exceptions: [] }, null, true),
    category: (el) => pickCategory(el.dataset.cat),
  });

  const form = sheet.querySelector('form');
  const f = form.elements;
  const hint = sheet.querySelector('[data-hint]');

  function sync() {
    form.classList.toggle('is-all-day', f.allDay.checked);
    form.classList.toggle('is-once', f.repeat.value === 'none');
    form.classList.toggle('is-forever', f.endRepeat.value !== 'on');
    const span = { allDay: false, start: f.start.value, end: f.end.value };
    hint.textContent = span.start && span.end
      ? formatDuration(durationMinutes(span)) + (isOvernight(span) ? ' · next day' : '')
      : '';
  }

  function readForm() {
    const repeat = f.repeat.value;
    return {
      title: f.title.value.trim(),
      categoryId,
      date: f.date.value || draft.date,
      allDay: f.allDay.checked,
      start: f.start.value || draft.start,
      end: f.end.value || draft.end,
      repeat,
      until: repeat !== 'none' && f.endRepeat.value === 'on' ? f.until.value || null : null,
      notes: f.notes.value.trim(),
    };
  }

  function pickCategory(id) {
    categoryId = id;
    sheet.querySelectorAll('.chip').forEach((chip) => {
      const on = chip.dataset.cat === id;
      chip.classList.toggle('on', on);
      chip.setAttribute('aria-checked', on);
    });
    // New shifts and workouts start at the times you used last for that category.
    const remembered = store.state.lastTimes[id];
    if (isNew && !timesTouched && remembered) {
      f.start.value = prevStart = remembered.start;
      f.end.value = remembered.end;
      sync();
    }
  }

  // Moving the start keeps the event's length, like the built-in Calendar.
  f.start.addEventListener('input', () => {
    if (!f.start.value) return;
    const length = durationMinutes({ allDay: false, start: prevStart, end: f.end.value || prevStart });
    f.end.value = addMinutes(f.start.value, length);
    prevStart = f.start.value;
    timesTouched = true;
    sync();
  });
  f.end.addEventListener('input', () => {
    timesTouched = true;
    sync();
  });
  f.endRepeat.addEventListener('change', () => {
    if (f.endRepeat.value === 'on' && !f.until.value) f.until.value = addDays(f.date.value || draft.date, 30);
    sync();
  });
  f.allDay.addEventListener('change', sync);
  f.repeat.addEventListener('change', sync);
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    document.activeElement?.blur();
  });
  sync();
  if (isNew && !duplicate && matchMedia('(hover: hover)').matches) f.title.focus();

  const unchanged = (data) =>
    Object.keys(data).every((k) => (k === 'date' ? data.date === on : (data[k] ?? null) === (source[k] ?? null)));

  async function save() {
    const data = readForm();
    if (data.until && data.until < data.date) {
      toast('The repeat must end after the event starts');
      return;
    }
    if (isNew) {
      store.addEvent(data);
    } else if (source.repeat === 'none') {
      store.updateEvent(source.id, data);
    } else if (!unchanged(data)) {
      const choice = await actionSheet({
        message: 'This is a repeating event.',
        actions: [
          { label: 'Save for This Event Only', value: 'one' },
          { label: 'Save for Future Events', value: 'future' },
        ],
      });
      if (!choice) return;
      if (choice === 'one') store.detachOccurrence(source.id, on, data);
      else store.splitSeries(source.id, on, data);
    }
    closeSheet();
    if (ui.tab === 'calendar') selectDay(data.date);
  }

  async function remove() {
    let actions = [{ label: 'Delete Event', value: 'all', destructive: true }];
    let message = '';
    if (source.repeat !== 'none') {
      message = 'This is a repeating event.';
      actions = [
        { label: 'Delete This Event Only', value: 'one', destructive: true },
        ...(on > source.date ? [{ label: 'Delete All Future Events', value: 'future', destructive: true }] : []),
        { label: 'Delete All Events', value: 'all', destructive: true },
      ];
    }
    const choice = await actionSheet({ message, actions });
    if (!choice) return;
    if (choice === 'one') store.skipOccurrence(source.id, on);
    else if (choice === 'future') store.endBefore(source.id, on);
    else store.deleteEvent(source.id);
    closeSheet();
  }
}

// ---------------------------------------------------------------- category editor

function openCategoryEditor(category = null) {
  const used = new Set(store.state.categories.map((c) => c.color));
  let color = category?.color ?? (PALETTE.find((p) => !used.has(p.hex)) ?? PALETTE[6]).hex;

  const swatches = PALETTE.map((p) => `
    <button type="button" class="swatch${p.hex === color ? ' on' : ''}" data-sheet="color" data-color="${p.hex}"
      style="--c:${p.hex}" role="radio" aria-checked="${p.hex === color}" aria-label="${p.name}"></button>`).join('');

  const sheet = openSheet(`
    <div class="sheet-head">
      <button class="text-btn" data-sheet="cancel">Cancel</button>
      <h3>${category ? 'Edit Category' : 'New Category'}</h3>
      <button class="text-btn strong" data-sheet="save">${category ? 'Done' : 'Add'}</button>
    </div>
    <form class="sheet-body" novalidate>
      <div class="group">
        <input class="field" name="name" placeholder="Name, e.g. School or Family" maxlength="40"
          value="${esc(category?.name ?? '')}" autocomplete="off" enterkeyhint="done">
      </div>
      <p class="group-label">Color</p>
      <div class="group swatches" role="radiogroup" aria-label="Color">${swatches}</div>
      ${category && store.state.categories.length > 1 ? `
        <div class="group"><button type="button" class="row destructive center" data-sheet="delete">Delete Category</button></div>` : ''}
    </form>`, {
    color: (el) => {
      color = el.dataset.color;
      sheet.querySelectorAll('.swatch').forEach((s) => {
        s.classList.toggle('on', s === el);
        s.setAttribute('aria-checked', s === el);
      });
    },
    save: () => {
      const name = sheet.querySelector('[name=name]').value.trim();
      if (!name) {
        sheet.querySelector('[name=name]').focus();
        toast('Give the category a name');
        return;
      }
      store.saveCategory({ id: category?.id, name, color });
      closeSheet();
    },
    delete: async () => {
      const count = store.state.events.filter((e) => e.categoryId === category.id).length;
      const fallback = store.state.categories.find((c) => c.id !== category.id);
      const choice = await actionSheet({
        message: count ? `${plural(count, 'event')} will move to “${fallback.name}”.` : '',
        actions: [{ label: 'Delete Category', value: true, destructive: true }],
      });
      if (!choice) return;
      if (ui.filter === category.id) ui.filter = 'all';
      store.deleteCategory(category.id);
      closeSheet();
    },
  });

  sheet.querySelector('form').addEventListener('submit', (e) => {
    e.preventDefault();
    document.activeElement?.blur();
  });
  if (!category && matchMedia('(hover: hover)').matches) sheet.querySelector('[name=name]').focus();
}

// ---------------------------------------------------------------- backup

async function exportBackup() {
  const name = `calendrier-backup-${todayKey()}.json`;
  const file = new File([store.exportData()], name, { type: 'application/json' });
  // On iPhone the share sheet lets you save the file to Files, AirDrop it, or email it.
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file] });
      return;
    } catch (err) {
      if (err.name === 'AbortError') return;
    }
  }
  const url = URL.createObjectURL(file);
  const link = Object.assign(document.createElement('a'), { href: url, download: name });
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function importBackup(file) {
  let backup;
  try {
    backup = parseBackup(await file.text());
  } catch {
    toast('That file isn’t a Calendrier backup');
    return;
  }
  const choice = await actionSheet({
    message: `Replace everything in your calendar with this backup (${plural(backup.events.length, 'event')})?`,
    actions: [{ label: 'Replace Calendar', value: true, destructive: true }],
  });
  if (!choice) return;
  ui.filter = 'all';
  store.replaceAll(backup);
  toast(`Restored ${plural(backup.events.length, 'event')}`);
}

// ---------------------------------------------------------------- wiring

const actions = {
  tab: (el) => {
    const tab = el.dataset.tab;
    // Tapping Calendar while already on it jumps back to today.
    if (tab === 'calendar' && ui.tab === 'calendar') return selectDay(ui.today);
    ui.tab = tab;
    render();
  },
  'shift-month': (el) => shiftMonth(Number(el.dataset.step)),
  today: () => selectDay(ui.today),
  'select-day': (el) => selectDay(el.dataset.key),
  'new-event': () => openEditor(),
  'open-event': (el) => {
    const event = store.getEvent(el.dataset.id);
    if (event) openEditor(event, el.dataset.on);
  },
  filter: (el) => {
    ui.filter = el.dataset.id;
    render();
  },
  'edit-category': (el) => openCategoryEditor(store.state.categories.find((c) => c.id === el.dataset.id)),
  'new-category': () => openCategoryEditor(),
  setting: (el) => {
    const { key, value } = el.dataset;
    store.updateSettings({ [key]: key === 'use24h' ? value === 'true' : Number(value) });
  },
  export: () => exportBackup(),
  reset: async () => {
    const choice = await actionSheet({
      message: 'This deletes every event and category on this device. It can’t be undone.',
      actions: [{ label: 'Erase All Data', value: true, destructive: true }],
    });
    if (!choice) return;
    ui.filter = 'all';
    store.reset();
    toast('All data erased');
  },
};

app.addEventListener('click', (e) => {
  const el = e.target.closest('[data-action]');
  if (el) actions[el.dataset.action]?.(el, e);
});

app.addEventListener('change', (e) => {
  if (!e.target.matches('[data-import]')) return;
  const [file] = e.target.files;
  e.target.value = '';
  if (file) importBackup(file);
});

// Swipe the month grid left/right to change month.
let touchStart = null;
app.addEventListener('touchstart', (e) => {
  touchStart = e.target.closest('#month') ? { x: e.touches[0].clientX, y: e.touches[0].clientY } : null;
}, { passive: true });
app.addEventListener('touchend', (e) => {
  if (!touchStart) return;
  const dx = e.changedTouches[0].clientX - touchStart.x;
  const dy = e.changedTouches[0].clientY - touchStart.y;
  touchStart = null;
  if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) shiftMonth(dx < 0 ? 1 : -1);
}, { passive: true });

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    if (!actionRoot.hidden) actionRoot.querySelector('.action-cancel')?.click();
    else if (!sheetRoot.hidden) closeSheet();
    return;
  }
  const typing = e.target.closest('input, textarea, select');
  if (typing || !sheetRoot.hidden || ui.tab !== 'calendar') return;
  if (e.key === 'ArrowLeft') shiftMonth(-1);
  if (e.key === 'ArrowRight') shiftMonth(1);
});

// Enables :active press states on iOS.
document.addEventListener('touchstart', () => {}, { passive: true });

document.addEventListener('visibilitychange', () => {
  if (!document.hidden) refreshToday();
});
setInterval(refreshToday, 60_000);

store.subscribe(render);
render();

if ('serviceWorker' in navigator && window.isSecureContext) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
