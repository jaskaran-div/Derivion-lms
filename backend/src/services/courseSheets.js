// Course sheets: a template (columns) uploaded by an admin; every learner fills their own rows.
const crypto = require('crypto');
const ExcelJS = require('exceljs');
const { isPlaceholderEmail } = require('../utils/credentials');

const MAX_COLUMNS = 30;
const MAX_LABEL = 80;
const MAX_CELL = 5000;
const MAX_ROWS_PER_LEARNER = 5000;

class SheetInputError extends Error {}

const newKey = () => `c_${crypto.randomBytes(4).toString('hex')}`;
const columnType = (label) => (/\bdate\b|\bday\b/i.test(label) ? 'date' : 'text');

const cellText = (value) => {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === 'object') {
    if (value.richText) return value.richText.map((t) => t.text).join('');
    if (value.text !== undefined) return String(value.text);
    if (value.result !== undefined) return cellText(value.result);
    return '';
  }
  return String(value);
};

// First line of a CSV file, split on commas outside quotes
const csvHeader = (text) => {
  const line = text.replace(/^﻿/, '').split(/\r?\n/).find((l) => l.trim() !== '') || '';
  const out = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') { field += '"'; i++; } else if (ch === '"') quoted = false; else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') { out.push(field); field = ''; } else field += ch;
  }
  out.push(field);
  return out;
};

// Column labels from the uploaded template: the first non-empty row of the first worksheet
const headersFromFile = async (file) => {
  const name = (file.originalname || '').toLowerCase();
  if (name.endsWith('.csv')) return csvHeader(file.buffer.toString('utf8'));
  if (!name.endsWith('.xlsx')) throw new SheetInputError('Upload an Excel (.xlsx) or CSV (.csv) file.');
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(file.buffer);
  } catch {
    throw new SheetInputError('This Excel file could not be read. Save it as .xlsx and try again.');
  }
  const ws = wb.worksheets[0];
  if (!ws) return [];
  for (let r = 1; r <= Math.min(ws.rowCount, 50); r++) {
    const row = ws.getRow(r);
    const labels = [];
    for (let c = 1; c <= Math.min(row.cellCount, MAX_COLUMNS * 2); c++) labels.push(cellText(row.getCell(c).value));
    if (labels.some((l) => l.trim() !== '')) return labels;
  }
  return [];
};

// Builds the column list; labels that already exist keep their key so learners' data stays attached
const buildColumns = (labels, previous = []) => {
  const byLabel = new Map(previous.map((c) => [c.label.toLowerCase(), c]));
  const seen = new Set();
  const columns = [];
  for (const raw of labels) {
    const label = String(raw || '').trim().slice(0, MAX_LABEL);
    if (!label || seen.has(label.toLowerCase())) continue;
    seen.add(label.toLowerCase());
    const prev = byLabel.get(label.toLowerCase());
    columns.push({ key: prev?.key || newKey(), label, type: prev?.type || columnType(label) });
    if (columns.length >= MAX_COLUMNS) break;
  }
  if (!columns.length) throw new SheetInputError('The template needs a header row with at least one column name.');
  return columns;
};

// Keeps only known columns, as trimmed strings; returns null when every cell is empty
const cleanRowData = (columns, input) => {
  if (!input || typeof input !== 'object') throw new SheetInputError('Row data is missing.');
  const data = {};
  for (const col of columns) {
    const v = input[col.key];
    data[col.key] = v === undefined || v === null ? '' : String(v).slice(0, MAX_CELL);
  }
  return Object.values(data).some((v) => v.trim() !== '') ? data : null;
};

const learnerName = (u) => `${u.firstName || ''} ${u.lastName || ''}`.trim() || u.username || u.email;
const learnerLogin = (u) => (u.email && !isPlaceholderEmail(u.email) ? u.email : u.username || '');

// Excel worksheet names: max 31 chars, no []:*?/\ and unique within the workbook
const worksheetName = (raw, used) => {
  const base = String(raw).replace(/[[\]:*?/\\]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 28).trim() || 'Learner';
  let name = base;
  for (let i = 2; used.has(name.toLowerCase()); i++) name = `${base.slice(0, 26)} ${i}`;
  used.add(name.toLowerCase());
  return name;
};

const styleHeader = (ws) => {
  ws.getRow(1).font = { bold: true };
  ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEFF2F7' } };
  ws.views = [{ state: 'frozen', ySplit: 1 }];
};

// Workbook: an "All learners" tab with every row, then one tab per learner
const buildWorkbook = async (sheet, learners) => {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Derivion LMS';
  const cols = sheet.columns;
  const used = new Set();

  if (learners.length > 1) {
    const all = wb.addWorksheet(worksheetName('All learners', used));
    all.columns = [
      { header: 'Learner', width: 24 }, { header: 'Login', width: 28 },
      ...cols.map((c) => ({ header: c.label, width: 22 })),
      { header: 'Added on', width: 20 }, { header: 'Last edited', width: 20 },
    ];
    for (const l of learners) {
      for (const r of l.rows) all.addRow([learnerName(l.user), learnerLogin(l.user), ...cols.map((c) => r.data?.[c.key] ?? ''), r.createdAt, r.updatedAt]);
    }
    styleHeader(all);
  }

  for (const l of learners) {
    const ws = wb.addWorksheet(worksheetName(learnerName(l.user), used));
    ws.columns = [...cols.map((c) => ({ header: c.label, width: 22 })), { header: 'Added on', width: 20 }, { header: 'Last edited', width: 20 }];
    for (const r of l.rows) ws.addRow([...cols.map((c) => r.data?.[c.key] ?? ''), r.createdAt, r.updatedAt]);
    styleHeader(ws);
  }
  if (!wb.worksheets.length) {
    const ws = wb.addWorksheet('Sheet');
    ws.columns = cols.map((c) => ({ header: c.label, width: 22 }));
    styleHeader(ws);
  }
  return wb.xlsx.writeBuffer();
};

module.exports = {
  MAX_ROWS_PER_LEARNER, SheetInputError,
  headersFromFile, buildColumns, cleanRowData, buildWorkbook, learnerName, learnerLogin,
};
