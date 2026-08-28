import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  classify,
  isInRange,
  computeStats,
  groupByDay,
  filterByDays,
  serializeCSV,
  formatDate,
  formatTime,
} from '../js/stats.js';

test('classify boundaries', () => {
  assert.equal(classify(69), 'low');
  assert.equal(classify(70), 'in-range');
  assert.equal(classify(140), 'in-range');
  assert.equal(classify(141), 'elevated');
  assert.equal(classify(180), 'elevated');
  assert.equal(classify(181), 'high');
  assert.equal(classify(19), 'low');
  assert.equal(classify(600), 'high');
});

test('isInRange', () => {
  assert.equal(isInRange(70), true);
  assert.equal(isInRange(140), true);
  assert.equal(isInRange(69), false);
  assert.equal(isInRange(141), false);
});

test('computeStats on empty set', () => {
  const s = computeStats([]);
  assert.deepEqual(s, { count: 0, avg: null, min: null, max: null, percentInRange: null });
});

test('computeStats aggregates and rounds', () => {
  const readings = [
    { value: 100 },
    { value: 150 },
    { value: 60 },
    { value: 200 },
  ];
  const s = computeStats(readings);
  assert.equal(s.count, 4);
  assert.equal(s.avg, 128);
  assert.equal(s.min, 60);
  assert.equal(s.max, 200);
  assert.equal(s.percentInRange, 25);
});

test('computeStats percentInRange 100', () => {
  const s = computeStats([{ value: 80 }, { value: 120 }, { value: 140 }]);
  assert.equal(s.percentInRange, 100);
});

test('date & time formatting DD/MM/YYYY 24h', () => {
  const d = new Date(2026, 0, 5, 9, 3);
  assert.equal(formatDate(d), '05/01/2026');
  assert.equal(formatTime(d), '09:03');
  const d2 = new Date(2026, 11, 31, 23, 59);
  assert.equal(formatDate(d2), '31/12/2026');
  assert.equal(formatTime(d2), '23:59');
});

test('groupByDay groups and sorts newest first', () => {
  const day1 = new Date(2026, 5, 1, 8, 0).getTime();
  const day1b = new Date(2026, 5, 1, 20, 0).getTime();
  const day2 = new Date(2026, 5, 2, 9, 0).getTime();
  const readings = [
    { id: 'a', value: 100, timestamp: day1 },
    { id: 'b', value: 110, timestamp: day2 },
    { id: 'c', value: 120, timestamp: day1b },
  ];
  const groups = groupByDay(readings);
  assert.equal(groups.length, 2);
  assert.equal(groups[0].label, '02/06/2026');
  assert.equal(groups[1].label, '01/06/2026');
  assert.equal(groups[1].readings[0].id, 'c');
  assert.equal(groups[1].readings[1].id, 'a');
});

test('filterByDays keeps only recent', () => {
  const now = new Date(2026, 0, 31, 12, 0).getTime();
  const readings = [
    { value: 1, timestamp: new Date(2026, 0, 30, 12, 0).getTime() },
    { value: 2, timestamp: new Date(2026, 0, 20, 12, 0).getTime() },
    { value: 3, timestamp: new Date(2025, 11, 1, 12, 0).getTime() },
  ];
  assert.equal(filterByDays(readings, 7, now).length, 1);
  assert.equal(filterByDays(readings, 30, now).length, 2);
  assert.equal(filterByDays(readings, 90, now).length, 3);
});

test('serializeCSV header and ordering', () => {
  const readings = [
    { value: 130, timestamp: new Date(2026, 0, 2, 10, 15).getTime(), tag: 'Ayunas', comment: '' },
    { value: 95, timestamp: new Date(2026, 0, 1, 8, 5).getTime(), tag: 'Otro', comment: 'ok' },
  ];
  const csv = serializeCSV(readings);
  const lines = csv.split('\r\n');
  assert.equal(lines[0], 'fecha,hora,valor_mg_dl,contexto,comentario');
  assert.equal(lines[1], '01/01/2026,08:05,95,Otro,ok');
  assert.equal(lines[2], '02/01/2026,10:15,130,Ayunas,');
});

test('serializeCSV escapes commas, quotes and newlines', () => {
  const readings = [
    {
      value: 100,
      timestamp: new Date(2026, 0, 1, 8, 0).getTime(),
      tag: 'Otro',
      comment: 'mareo, con "sudor"\nfuerte',
    },
  ];
  const csv = serializeCSV(readings);
  const dataLine = csv.split('\r\n')[1];
  assert.equal(dataLine, '01/01/2026,08:00,100,Otro,"mareo, con ""sudor""\nfuerte"');
});
