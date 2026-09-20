// csv.js
// Same export mechanic the Household Ledger uses for its Markdown report:
// build the text in memory, wrap it in a Blob, click a synthetic anchor,
// revoke the object URL. No server round-trip, no dependency.

// Quote anything that could confuse a spreadsheet, and double up embedded
// quotes. Leading BOM on the file so Excel reads it as UTF-8 rather than
// mangling names with accents.
function cell(value) {
  const text = value === null || value === undefined ? '' : String(value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function toCSV(headers, rows) {
  return [headers, ...rows].map((row) => row.map(cell).join(',')).join('\r\n');
}

export function downloadCSV(filename, headers, rows) {
  const blob = new Blob([`﻿${toCSV(headers, rows)}`], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
