export const RANGE = { low: 70, inRangeMax: 140, elevatedMax: 180 };

export const TAGS = ['Ayunas', 'Desayuno', 'Almuerzo', 'Comida'];
export const DAY_CLOSE_TAG = 'Comida';

export function classify(value) {
  if (value < RANGE.low) return 'low';
  if (value <= RANGE.inRangeMax) return 'in-range';
  if (value <= RANGE.elevatedMax) return 'elevated';
  return 'high';
}

export function isInRange(value) {
  return value >= RANGE.low && value <= RANGE.inRangeMax;
}

export function computeStats(readings) {
  if (!readings || readings.length === 0) {
    return { count: 0, avg: null, min: null, max: null, percentInRange: null };
  }
  let sum = 0;
  let min = Infinity;
  let max = -Infinity;
  let inRange = 0;
  for (const r of readings) {
    sum += r.value;
    if (r.value < min) min = r.value;
    if (r.value > max) max = r.value;
    if (isInRange(r.value)) inRange++;
  }
  return {
    count: readings.length,
    avg: Math.round(sum / readings.length),
    min,
    max,
    percentInRange: Math.round((inRange / readings.length) * 100),
  };
}

export function pad2(n) {
  return String(n).padStart(2, '0');
}

export function formatDate(date) {
  return `${pad2(date.getDate())}/${pad2(date.getMonth() + 1)}/${date.getFullYear()}`;
}

export function formatTime(date) {
  return `${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
}

export function dayKey(date) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

export function groupByDay(readings) {
  const sorted = [...readings].sort((a, b) => b.timestamp - a.timestamp);
  const groups = new Map();
  for (const r of sorted) {
    const d = new Date(r.timestamp);
    const key = dayKey(d);
    if (!groups.has(key)) {
      groups.set(key, { key, label: formatDate(d), timestamp: d.getTime(), readings: [] });
    }
    groups.get(key).readings.push(r);
  }
  return [...groups.values()].sort((a, b) => b.timestamp - a.timestamp);
}

export function filterByDays(readings, days, now = Date.now()) {
  const cutoff = now - days * 24 * 60 * 60 * 1000;
  return readings.filter((r) => r.timestamp >= cutoff);
}

function csvEscape(value) {
  const s = value == null ? '' : String(value);
  if (/[",\n\r]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export function serializeCSV(readings) {
  const header = ['fecha', 'hora', 'valor_mg_dl', 'contexto', 'comentario'];
  const sorted = [...readings].sort((a, b) => a.timestamp - b.timestamp);
  const rows = sorted.map((r) => {
    const d = new Date(r.timestamp);
    return [formatDate(d), formatTime(d), r.value, r.tag || '', r.comment || '']
      .map(csvEscape)
      .join(',');
  });
  return [header.join(','), ...rows].join('\r\n');
}
