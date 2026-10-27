// CSV cell, quoted, with spreadsheet formula triggers (=, +, -, @, tab, CR) neutralised
const csvCell = (val) => {
  if (val === null || val === undefined) return '""';
  let str = val instanceof Date ? val.toISOString() : String(val);
  if (/^[=+\-@\t\r]/.test(str)) str = `'${str}`;
  return `"${str.replace(/"/g, '""')}"`;
};

const toCSV = (headers, rows) => [headers.map(csvCell).join(','), ...rows.map((r) => r.map(csvCell).join(','))].join('\n');

// Sends a CSV download (with a BOM so Excel reads UTF-8 names correctly)
const sendCSV = (res, filename, headers, rows) => {
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(`﻿${toCSV(headers, rows)}`);
};

const isoDate = (d) => (d ? new Date(d).toISOString().split('T')[0] : '');

module.exports = { csvCell, toCSV, sendCSV, isoDate };
