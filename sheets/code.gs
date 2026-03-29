/**
 * Briefly V2 — Google Apps Script (code.gs)
 * 
 * SETUP:
 * 1. Extensions → Apps Script → paste this → save
 * 2. Deploy → New deployment → Web App
 *    Execute as: Me | Access: Anyone
 * 3. Authorize → copy Web App URL → paste in Briefly Settings
 */

const SHEET_NAME   = 'Applications';
const STATUS_COL   = 4;   // Column D
const STATUS_VALUES = ['Applied', 'OA', 'Interview', 'Rejected', 'Offer'];
const COLUMNS       = ['Date', 'Company', 'Role', 'Status', 'URL', 'Notes'];

// ─── doPost ───────────────────────────────────────────────────────────────────
function doPost(e) {
  try {
    const payload = JSON.parse(e.postData.contents);
    const ss      = SpreadsheetApp.getActiveSpreadsheet();
    const sheet   = getOrCreateSheet(ss);

    // Append data row
    const row = [
      payload.date    || Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd'),
      payload.company || '',
      payload.role    || '',
      payload.status  || 'Applied',
      payload.url     || '',
      payload.notes   || '',
    ];
    sheet.appendRow(row);

    const lastRow = sheet.getLastRow();

    // ── Apply status dropdown to the new row's Status cell ──────────────────
    applyStatusDropdown(sheet, lastRow);

    // ── Colour-code the entire row by status ─────────────────────────────────
    colourRowByStatus(sheet, lastRow, payload.status);

    // Auto-resize for readability
    sheet.autoResizeColumns(1, COLUMNS.length);

    return jsonResponse({ success: true, row: lastRow });

  } catch (err) {
    return jsonResponse({ success: false, error: err.message });
  }
}

// ─── doGet (health check / test) ──────────────────────────────────────────────
function doGet(_e) {
  const ss    = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET_NAME);
  const count = sheet ? Math.max(sheet.getLastRow() - 1, 0) : 0;
  return jsonResponse({ status: 'Briefly Logger active', applications_logged: count, sheet: SHEET_NAME });
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Get existing sheet or create it with formatted headers */
function getOrCreateSheet(ss) {
  let sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);

    // Header row
    const headerRange = sheet.getRange(1, 1, 1, COLUMNS.length);
    headerRange
      .setValues([COLUMNS])
      .setFontWeight('bold')
      .setFontColor('#ffffff')
      .setBackground('#1a73e8')
      .setHorizontalAlignment('center');

    // Freeze header + set column widths
    sheet.setFrozenRows(1);
    sheet.setColumnWidth(1, 100); // Date
    sheet.setColumnWidth(2, 160); // Company
    sheet.setColumnWidth(3, 200); // Role
    sheet.setColumnWidth(4, 120); // Status
    sheet.setColumnWidth(5, 240); // URL
    sheet.setColumnWidth(6, 200); // Notes

    // Apply dropdown to ALL future data rows (2 → 1000)
    applyStatusDropdownRange(sheet, 2, 1000);
  }
  return sheet;
}

/**
 * Set a Data Validation dropdown on a single row's Status cell.
 * Called per-row so every appended row gets the rule even if the
 * sheet already existed without pre-applied validation.
 */
function applyStatusDropdown(sheet, row) {
  const cell  = sheet.getRange(row, STATUS_COL);
  const rule  = SpreadsheetApp.newDataValidation()
    .requireValueInList(STATUS_VALUES, true)   // true = show dropdown
    .setAllowInvalid(false)
    .setHelpText('Select application status')
    .build();
  cell.setDataValidation(rule);
}

/**
 * Apply dropdown to a range of rows at once (used during sheet creation).
 */
function applyStatusDropdownRange(sheet, startRow, endRow) {
  const range = sheet.getRange(startRow, STATUS_COL, endRow - startRow + 1, 1);
  const rule  = SpreadsheetApp.newDataValidation()
    .requireValueInList(STATUS_VALUES, true)
    .setAllowInvalid(false)
    .setHelpText('Select application status')
    .build();
  range.setDataValidation(rule);
}

/** Colour-code the row background based on status */
function colourRowByStatus(sheet, row, status) {
  const colours = {
    'Applied':   '#e8f5e9',   // light green
    'OA':        '#fff8e1',   // light amber
    'Interview': '#e3f2fd',   // light blue
    'Rejected':  '#ffebee',   // light red
    'Offer':     '#f3e5f5',   // light purple
  };
  const bg = colours[status] || '#ffffff';
  sheet.getRange(row, 1, 1, COLUMNS.length).setBackground(bg);
}

/** Helper to return a JSON ContentService response */
function jsonResponse(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}