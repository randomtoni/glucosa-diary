import { classify, formatDate, pad2, RANGE } from './stats.js';

const W = 360;
const H = 240;
const PAD = { top: 14, right: 12, bottom: 24, left: 34 };
const DAY = 24 * 60 * 60 * 1000;

function niceDomain(readings) {
  let dataMin = Infinity;
  let dataMax = -Infinity;
  for (const r of readings) {
    if (r.value < dataMin) dataMin = r.value;
    if (r.value > dataMax) dataMax = r.value;
  }
  if (!isFinite(dataMin)) {
    dataMin = RANGE.low;
    dataMax = RANGE.inRangeMax;
  }
  const yMin = Math.min(50, Math.floor((dataMin - 10) / 10) * 10);
  const yMax = Math.max(200, Math.ceil((dataMax + 15) / 10) * 10);
  return { yMin: Math.max(0, yMin), yMax };
}

function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function buildChartSVG(readings, { days, now = Date.now() } = {}) {
  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;
  const xMax = now;
  const xMin = now - days * DAY;
  const { yMin, yMax } = niceDomain(readings);

  const xOf = (t) => PAD.left + ((t - xMin) / (xMax - xMin)) * plotW;
  const yOf = (v) => PAD.top + (1 - (v - yMin) / (yMax - yMin)) * plotH;

  const parts = [];
  parts.push(
    `<svg viewBox="0 0 ${W} ${H}" class="chart-svg" role="img" aria-label="Gráfico de glucosa" preserveAspectRatio="xMidYMid meet">`
  );

  const bandTop = yOf(RANGE.inRangeMax);
  const bandBottom = yOf(RANGE.low);
  parts.push(
    `<rect class="chart-band" x="${PAD.left}" y="${bandTop.toFixed(1)}" width="${plotW}" height="${(bandBottom - bandTop).toFixed(1)}" />`
  );

  const gridValues = [RANGE.low, RANGE.inRangeMax, RANGE.elevatedMax].filter(
    (v) => v >= yMin && v <= yMax
  );
  for (const v of gridValues) {
    const y = yOf(v);
    parts.push(
      `<line class="chart-grid" x1="${PAD.left}" y1="${y.toFixed(1)}" x2="${W - PAD.right}" y2="${y.toFixed(1)}" />`
    );
    parts.push(
      `<text class="chart-axis-label" x="${PAD.left - 5}" y="${(y + 3).toFixed(1)}" text-anchor="end">${v}</text>`
    );
  }

  const ticks = days <= 14 ? Math.min(days, 7) : 5;
  for (let i = 0; i <= ticks; i++) {
    const t = xMin + ((xMax - xMin) * i) / ticks;
    const d = new Date(t);
    const label = `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}`;
    const x = xOf(t);
    parts.push(
      `<text class="chart-axis-label" x="${x.toFixed(1)}" y="${H - 8}" text-anchor="middle">${label}</text>`
    );
  }

  const sorted = [...readings].sort((a, b) => a.timestamp - b.timestamp);

  if (sorted.length >= 2) {
    const dAttr = sorted
      .map((r, i) => `${i === 0 ? 'M' : 'L'}${xOf(r.timestamp).toFixed(1)},${yOf(r.value).toFixed(1)}`)
      .join(' ');
    parts.push(`<path class="chart-line" d="${dAttr}" fill="none" />`);
  }

  for (const r of sorted) {
    const cx = xOf(r.timestamp);
    const cy = yOf(r.value);
    const cls = classify(r.value);
    const d = new Date(r.timestamp);
    const title = `${r.value} mg/dL · ${formatDate(d)} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
    parts.push(
      `<circle class="chart-dot dot-${cls}" cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="3.5"><title>${esc(title)}</title></circle>`
    );
  }

  if (sorted.length === 0) {
    parts.push(
      `<text class="chart-empty" x="${W / 2}" y="${H / 2}" text-anchor="middle">Sin datos en este período</text>`
    );
  }

  parts.push('</svg>');
  return parts.join('');
}
