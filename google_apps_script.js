/**
 * Google Apps Script — Briefly Application Logger
 * 
 * SETUP INSTRUCTIONS:
 * 1. Open Google Sheets → Extensions → Apps Script
 * 2. Paste this entire script, replacing any existing code
 * 3. Save (Ctrl+S / Cmd+S)
 * 4. Click "Deploy" → "New deployment"
 * 5. Select type: "Web App"
 * 6. Execute as: "Me" | Who has access: "Anyone"
 * 7. Click Deploy → Authorize → Copy the Web App URL
 * 8. Paste the URL in Briefly Settings → Google Script Web App URL
 * 
 * The sheet will auto-create headers on first use.
 */

const SHEET_NAME = 'Applications';

const COLUMNS = ['Date', 'Company', 'Role', 'Status', 'URL', 'Notes'];

function doPost(e) {
  try {
    const payload = JSON.parse(e.postData.contents);
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    let sheet = ss.getSheetByName(SHEET_NAME);

    // Create sheet with headers if it doesn't exist
    if (!sheet) {
      sheet = ss.insertSheet(SHEET_NAME);
      sheet.getRange(1, 1, 1, COLUMNS.length)
        .setValues([COLUMNS])
        .setFontWeight('bold')
        .setBackground('#1a73e8')
        .setFontColor('#ffffff');
      sheet.setFrozenRows(1);
    }

    // Append row
    const row = [
      payload.date    || new Date().toISOString().split('T')[0],
      payload.company || '',
      payload.role    || '',
      payload.status  || 'Applied',
      payload.url     || '',
      payload.notes   || '',
    ];
    sheet.appendRow(row);

    // Auto-resize columns for readability
    sheet.autoResizeColumns(1, COLUMNS.length);

    // Color-code the Status cell based on value
    const lastRow = sheet.getLastRow();
    const statusCell = sheet.getRange(lastRow, 4); // Column D = Status
    const statusColors = {
      'Applied':   '#e8f5e9',
      'OA':        '#fff3e0',
      'Interview': '#e3f2fd',
      'Rejected':  '#ffebee',
    };
    const color = statusColors[payload.status] || '#ffffff';
    statusCell.setBackground(color);

    return ContentService
      .createTextOutput(JSON.stringify({ success: true, row: lastRow }))
      .setMimeType(ContentService.MimeType.JSON);

  } catch (error) {
    return ContentService
      .createTextOutput(JSON.stringify({ success: false, error: error.message }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

// Handle GET for testing (visit the URL in browser to verify it's working)
function doGet(e) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET_NAME);
  const count = sheet ? sheet.getLastRow() - 1 : 0;
  return ContentService
    .createTextOutput(JSON.stringify({
      status: 'Briefly Logger is active',
      applications_logged: Math.max(count, 0),
      sheet: SHEET_NAME,
    }))
    .setMimeType(ContentService.MimeType.JSON);
}
