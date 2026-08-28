import {
  getAllReadings,
  putReading,
  deleteReading,
  replaceAllReadings,
  getMeta,
  setMeta,
  newId,
} from './db.js';
import {
  TAGS,
  DAY_CLOSE_TAG,
  classify,
  computeStats,
  groupByDay,
  filterByDays,
  formatTime,
  serializeCSV,
  dayKey,
  pad2,
} from './stats.js';
import { buildChartSVG } from './chart.js';

const THIRTY_DAYS = 30 * 24 * 60 * 60 * 1000;
const MIN_VALUE = 20;
const MAX_VALUE = 600;

const state = {
  readings: [],
  chartDays: 7,
  editingId: null,
  selectedTag: TAGS[0],
  confirmAction: null,
};

const $ = (id) => document.getElementById(id);

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function toDateInputValue(d) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}
function toTimeInputValue(d) {
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

/* ---------- Rendering ---------- */

function render() {
  renderLog();
  renderChart();
  renderBackupBanner();
}

function renderLog() {
  const list = $('log-list');
  const empty = $('log-empty');
  if (state.readings.length === 0) {
    list.innerHTML = '';
    empty.hidden = false;
    return;
  }
  empty.hidden = true;
  const groups = groupByDay(state.readings);
  list.innerHTML = groups.map(renderDayGroup).join('');
  list.querySelectorAll('.reading').forEach((el) => {
    el.addEventListener('click', () => openForm(el.dataset.id));
  });
}

function renderDayGroup(group) {
  const items = group.readings.map(renderReading).join('');
  const count = group.readings.length;
  const countLabel = count === 1 ? '1 lectura' : `${count} lecturas`;
  return `
    <div class="day-group">
      <div class="day-header"><span>${group.label}</span><span class="day-count">${countLabel}</span></div>
      ${items}
    </div>`;
}

function renderReading(r) {
  const d = new Date(r.timestamp);
  const cls = 'status-' + classify(r.value);
  const comment = r.comment
    ? `<div class="reading-comment">${escapeHtml(r.comment)}</div>`
    : '';
  const tag = r.tag
    ? `<span class="reading-tag">${escapeHtml(r.tag)}</span>`
    : '';
  return `
    <button class="reading" data-id="${r.id}" type="button">
      <span class="dot ${cls}" aria-hidden="true"></span>
      <span class="reading-value ${cls}">${r.value}<span class="unit">mg/dL</span></span>
      <span class="reading-body">
        <span class="reading-meta"><span class="reading-time">${formatTime(d)}</span>${tag}</span>
        ${comment}
      </span>
      <span class="chevron" aria-hidden="true">
        <svg viewBox="0 0 24 24" width="18" height="18"><path d="M9 6l6 6-6 6" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>
      </span>
    </button>`;
}

function renderChart() {
  const filtered = filterByDays(state.readings, state.chartDays);
  const stats = computeStats(filtered);
  $('stat-avg').textContent = stats.avg == null ? '—' : stats.avg;
  $('stat-min').textContent = stats.min == null ? '—' : stats.min;
  $('stat-max').textContent = stats.max == null ? '—' : stats.max;
  $('stat-range').textContent = stats.percentInRange == null ? '—' : stats.percentInRange + '%';
  $('chart-wrap').innerHTML = buildChartSVG(filtered, { days: state.chartDays });
  const n = filtered.length;
  $('chart-count').textContent =
    n === 0
      ? 'Sin lecturas en los últimos ' + state.chartDays + ' días'
      : `${n} ${n === 1 ? 'lectura' : 'lecturas'} en los últimos ${state.chartDays} días`;
}

async function renderBackupBanner() {
  const banner = $('backup-banner');
  if (sessionStorage.getItem('backup-dismissed') === '1' || state.readings.length === 0) {
    banner.hidden = true;
    return;
  }
  const last = await getMeta('lastBackupAt');
  const oldest = Math.min(...state.readings.map((r) => r.timestamp));
  const reference = last || oldest;
  const stale = Date.now() - reference > THIRTY_DAYS;
  banner.hidden = !stale;
}

/* ---------- Tabs ---------- */

function showView(name) {
  const isLog = name === 'log';
  $('view-log').classList.toggle('is-active', isLog);
  $('view-log').hidden = !isLog;
  $('view-chart').classList.toggle('is-active', !isLog);
  $('view-chart').hidden = isLog;
  $('tab-log').classList.toggle('is-active', isLog);
  $('tab-chart').classList.toggle('is-active', !isLog);
  $('tab-log').setAttribute('aria-selected', String(isLog));
  $('tab-chart').setAttribute('aria-selected', String(!isLog));
  if (!isLog) renderChart();
}

/* ---------- Form sheet ---------- */

function buildTagChips() {
  const wrap = $('tag-chips');
  wrap.innerHTML = TAGS.map(
    (t) =>
      `<button type="button" class="chip" data-tag="${escapeHtml(t)}">${escapeHtml(t)}</button>`
  ).join('');
  wrap.querySelectorAll('.chip').forEach((chip) => {
    chip.addEventListener('click', () => selectTag(chip.dataset.tag));
  });
}

function selectTag(tag) {
  state.selectedTag = tag;
  $('tag-chips')
    .querySelectorAll('.chip')
    .forEach((c) => c.classList.toggle('is-active', c.dataset.tag === tag));
}

function openForm(id) {
  const editing = Boolean(id);
  state.editingId = id || null;
  $('form-title').textContent = editing ? 'Editar lectura' : 'Nueva lectura';
  $('reading-id').value = id || '';
  $('value-error').hidden = true;
  $('delete-btn').hidden = !editing;

  if (editing) {
    const r = state.readings.find((x) => x.id === id);
    const d = new Date(r.timestamp);
    $('value-input').value = String(r.value);
    $('date-input').value = toDateInputValue(d);
    $('time-input').value = toTimeInputValue(d);
    $('comment-input').value = r.comment || '';
    selectTag(r.tag || TAGS[0]);
  } else {
    const now = new Date();
    $('value-input').value = '';
    $('date-input').value = toDateInputValue(now);
    $('time-input').value = toTimeInputValue(now);
    $('comment-input').value = '';
    selectTag(TAGS[0]);
  }

  openSheet('form');
  if (!editing) {
    setTimeout(() => $('value-input').focus(), 120);
  }
}

async function submitForm(e) {
  e.preventDefault();
  const raw = $('value-input').value.replace(/[^0-9]/g, '');
  const value = parseInt(raw, 10);
  if (!raw || isNaN(value) || value < MIN_VALUE || value > MAX_VALUE) {
    $('value-error').hidden = false;
    $('value-input').focus();
    return;
  }
  const dateStr = $('date-input').value;
  const timeStr = $('time-input').value;
  const [y, m, day] = dateStr.split('-').map(Number);
  const [hh, mm] = timeStr.split(':').map(Number);
  const timestamp = new Date(y, m - 1, day, hh, mm, 0, 0).getTime();

  const now = Date.now();
  const existing = state.editingId
    ? state.readings.find((x) => x.id === state.editingId)
    : null;

  const reading = {
    id: state.editingId || newId(),
    value,
    timestamp,
    tag: state.selectedTag,
    comment: $('comment-input').value.trim(),
    createdAt: existing ? existing.createdAt : now,
    updatedAt: now,
  };

  await putReading(reading);
  await ensurePersistentStorage();
  await refreshReadings();
  closeSheet('form');
  showToast(existing ? 'Lectura actualizada' : 'Lectura guardada');
  if (!existing) await maybeDailyBackupPrompt(reading);
}

function requestDelete() {
  const id = state.editingId;
  if (!id) return;
  openConfirm('¿Eliminar lectura?', 'Esta acción no se puede deshacer.', async () => {
    await deleteReading(id);
    await refreshReadings();
    closeSheet('form');
    showToast('Lectura eliminada');
  });
}

/* ---------- Data / export / import ---------- */

async function refreshReadings() {
  state.readings = await getAllReadings();
  render();
}

function shareOrDownload(filename, mimeType, content) {
  const blob = new Blob([content], { type: mimeType });
  try {
    const file = new File([blob], filename, { type: mimeType });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      navigator
        .share({ files: [file], title: filename })
        .catch((err) => {
          if (err && err.name !== 'AbortError') downloadBlob(blob, filename);
        });
      return;
    }
  } catch (_) {
    /* fall through to download */
  }
  downloadBlob(blob, filename);
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

function stamp() {
  const d = new Date();
  return `${d.getFullYear()}${pad2(d.getMonth() + 1)}${pad2(d.getDate())}`;
}

function exportCSV() {
  if (state.readings.length === 0) {
    showToast('No hay datos para exportar');
    return;
  }
  const csv = '﻿' + serializeCSV(state.readings);
  shareOrDownload(`glucosa-${stamp()}.csv`, 'text/csv;charset=utf-8', csv);
  closeSheet('menu');
}

function backupFilename() {
  return `glucosa-backup-${stamp()}.json`;
}

function backupString() {
  const payload = {
    app: 'glucosa',
    version: 1,
    exportedAt: new Date().toISOString(),
    readings: state.readings,
  };
  return JSON.stringify(payload, null, 2);
}

async function markBackupDone() {
  await setMeta('lastBackupAt', Date.now());
  await renderBackupBanner();
  updateBackupNote();
}

async function exportJSON() {
  shareOrDownload(backupFilename(), 'application/json', backupString());
  await markBackupDone();
  closeSheet('menu');
}

async function maybeDailyBackupPrompt(reading) {
  if (reading.tag !== DAY_CLOSE_TAG) return;
  const key = dayKey(new Date(reading.timestamp));
  const promptedDay = await getMeta('lastAutoBackupDay');
  if (promptedDay === key) return;
  await setMeta('lastAutoBackupDay', key);
  const lastBackup = await getMeta('lastBackupAt');
  if (lastBackup && dayKey(new Date(lastBackup)) === key) return;
  openDailyBackup();
}

function openDailyBackup() {
  $('daily-backdrop').hidden = false;
  $('daily-dialog').hidden = false;
}

function closeDailyBackup() {
  $('daily-backdrop').hidden = true;
  $('daily-dialog').hidden = true;
}

function confirmDailyBackup() {
  shareOrDownload(backupFilename(), 'application/json', backupString());
  markBackupDone();
  closeDailyBackup();
  showToast('Copia del día guardada');
}

async function importJSON(file) {
  try {
    const text = await file.text();
    const data = JSON.parse(text);
    const incoming = Array.isArray(data) ? data : data.readings;
    if (!Array.isArray(incoming)) throw new Error('formato inválido');
    const cleaned = incoming
      .filter((r) => r && typeof r.value === 'number' && typeof r.timestamp === 'number')
      .map((r) => ({
        id: typeof r.id === 'string' ? r.id : newId(),
        value: Math.round(r.value),
        timestamp: r.timestamp,
        tag: typeof r.tag === 'string' ? r.tag : '',
        comment: typeof r.comment === 'string' ? r.comment : '',
        createdAt: typeof r.createdAt === 'number' ? r.createdAt : r.timestamp,
        updatedAt: typeof r.updatedAt === 'number' ? r.updatedAt : Date.now(),
      }));
    if (cleaned.length === 0) throw new Error('sin lecturas válidas');

    openConfirm(
      '¿Restaurar backup?',
      `Se reemplazarán los datos actuales por ${cleaned.length} ${
        cleaned.length === 1 ? 'lectura' : 'lecturas'
      } del archivo.`,
      async () => {
        await replaceAllReadings(cleaned);
        await refreshReadings();
        closeSheet('menu');
        showToast('Datos restaurados');
      }
    );
  } catch (err) {
    showToast('No se pudo leer el archivo');
  }
}

function updateBackupNote() {
  getMeta('lastBackupAt').then((last) => {
    const note = $('backup-note');
    if (!last) {
      note.textContent = 'Todavía no hiciste ningún backup.';
    } else {
      const d = new Date(last);
      note.textContent = `Último backup: ${pad2(d.getDate())}/${pad2(
        d.getMonth() + 1
      )}/${d.getFullYear()}.`;
    }
  });
}

async function updateStorageNote() {
  const note = $('storage-note');
  if (!navigator.storage) {
    note.textContent = '';
    return;
  }
  let persisted = false;
  try {
    persisted = await navigator.storage.persisted();
  } catch (_) {
    /* ignore */
  }
  note.textContent = persisted
    ? 'Almacenamiento persistente activado en este dispositivo.'
    : 'Guardá un backup cada tanto: iOS puede borrar los datos de apps poco usadas.';
}

async function ensurePersistentStorage() {
  if (!navigator.storage || !navigator.storage.persist) return;
  const already = await getMeta('persistRequested');
  if (already) return;
  await setMeta('persistRequested', true);
  try {
    await navigator.storage.persist();
  } catch (_) {
    /* ignore */
  }
}

/* ---------- Sheets / dialogs plumbing ---------- */

function openSheet(name) {
  $(`${name}-backdrop`).hidden = false;
  $(`${name}-sheet`).hidden = false;
  document.documentElement.style.overflow = 'hidden';
}
function closeSheet(name) {
  $(`${name}-backdrop`).hidden = true;
  $(`${name}-sheet`).hidden = true;
  document.documentElement.style.overflow = '';
}

function openConfirm(title, text, action) {
  $('confirm-title').textContent = title;
  $('confirm-text').textContent = text;
  state.confirmAction = action;
  $('confirm-backdrop').hidden = false;
  $('confirm-dialog').hidden = false;
}
function closeConfirm() {
  $('confirm-backdrop').hidden = true;
  $('confirm-dialog').hidden = true;
  state.confirmAction = null;
}

let toastTimer = null;
function showToast(msg) {
  const toast = $('toast');
  toast.textContent = msg;
  toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toast.hidden = true;
  }, 2600);
}

function openMenu() {
  updateBackupNote();
  updateStorageNote();
  openSheet('menu');
}

/* ---------- Service worker ---------- */

function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('sw.js')
      .then((reg) => {
        reg.addEventListener('updatefound', () => {
          const nw = reg.installing;
          if (!nw) return;
          nw.addEventListener('statechange', () => {
            if (nw.state === 'installed' && navigator.serviceWorker.controller) {
              showUpdateToast(reg);
            }
          });
        });
      })
      .catch(() => {});

    let reloaded = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (reloaded) return;
      reloaded = true;
      window.location.reload();
    });
  });
}

function showUpdateToast(reg) {
  const toast = $('update-toast');
  toast.hidden = false;
  $('update-btn').onclick = () => {
    const w = reg.waiting;
    if (w) w.postMessage({ type: 'SKIP_WAITING' });
    toast.hidden = true;
  };
}

/* ---------- Wiring ---------- */

function bindEvents() {
  $('tab-log').addEventListener('click', () => showView('log'));
  $('tab-chart').addEventListener('click', () => showView('chart'));

  $('fab').addEventListener('click', () => openForm(null));
  $('form-close').addEventListener('click', () => closeSheet('form'));
  $('form-backdrop').addEventListener('click', () => closeSheet('form'));
  $('reading-form').addEventListener('submit', submitForm);
  $('delete-btn').addEventListener('click', requestDelete);

  $('value-input').addEventListener('input', (e) => {
    e.target.value = e.target.value.replace(/[^0-9]/g, '');
    if (!$('value-error').hidden) $('value-error').hidden = true;
  });

  document.querySelectorAll('.range-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.chartDays = Number(btn.dataset.days);
      document
        .querySelectorAll('.range-btn')
        .forEach((b) => b.classList.toggle('is-active', b === btn));
      renderChart();
    });
  });

  $('menu-btn').addEventListener('click', openMenu);
  $('menu-close').addEventListener('click', () => closeSheet('menu'));
  $('menu-backdrop').addEventListener('click', () => closeSheet('menu'));
  $('export-csv').addEventListener('click', exportCSV);
  $('export-json').addEventListener('click', exportJSON);
  $('import-json').addEventListener('click', () => $('import-file').click());
  $('import-file').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) importJSON(file);
    e.target.value = '';
  });

  $('banner-backup').addEventListener('click', exportJSON);
  $('banner-dismiss').addEventListener('click', () => {
    sessionStorage.setItem('backup-dismissed', '1');
    $('backup-banner').hidden = true;
  });

  $('confirm-cancel').addEventListener('click', closeConfirm);
  $('confirm-backdrop').addEventListener('click', closeConfirm);
  $('confirm-ok').addEventListener('click', () => {
    const action = state.confirmAction;
    closeConfirm();
    if (action) action();
  });

  $('daily-save').addEventListener('click', confirmDailyBackup);
  $('daily-later').addEventListener('click', closeDailyBackup);
  $('daily-backdrop').addEventListener('click', closeDailyBackup);

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (!$('daily-dialog').hidden) closeDailyBackup();
      else if (!$('confirm-dialog').hidden) closeConfirm();
      else if (!$('form-sheet').hidden) closeSheet('form');
      else if (!$('menu-sheet').hidden) closeSheet('menu');
    }
  });
}

async function init() {
  buildTagChips();
  bindEvents();
  registerServiceWorker();
  await refreshReadings();
}

init();
