import * as XLSX from 'xlsx';
import { ParsedSheet, ParsedWorkbook } from '@/types';
import { generateId } from './utils';

/**
 * Detect the header row in a worksheet by looking for rows with many text values
 * that look like column headers (short strings, common keywords)
 */
function detectHeaderRow(worksheet: XLSX.WorkSheet): number {
  const range = XLSX.utils.decode_range(worksheet['!ref'] || 'A1');
  const headerKeywords = ['description', 'item', 'name', 'total', 'amount', 'cost', 'price', 'qty', 'quantity', 'unit', 'remarks', 'notes', 'csi', 'code'];

  let bestRow = 0;
  let bestScore = 0;

  // Check first 15 rows for potential header row
  for (let row = range.s.r; row <= Math.min(range.s.r + 15, range.e.r); row++) {
    let score = 0;
    let textCount = 0;

    for (let col = range.s.c; col <= Math.min(range.s.c + 10, range.e.c); col++) {
      const cellAddress = XLSX.utils.encode_cell({ r: row, c: col });
      const cell = worksheet[cellAddress];

      if (cell && typeof cell.v === 'string') {
        textCount++;
        const lower = cell.v.toLowerCase();

        // Score based on header-like characteristics
        if (headerKeywords.some(kw => lower.includes(kw))) {
          score += 10;
        }
        // Short strings are more likely headers
        if (cell.v.length < 30 && cell.v.length > 1) {
          score += 2;
        }
        // All caps or title case suggests header
        if (cell.v === cell.v.toUpperCase() || /^[A-Z][a-z]/.test(cell.v)) {
          score += 1;
        }
      }
    }

    // Prefer rows with multiple text values
    score += textCount * 2;

    if (score > bestScore) {
      bestScore = score;
      bestRow = row;
    }
  }

  return bestRow;
}

export function parseExcelBuffer(buffer: ArrayBuffer, filename: string): ParsedWorkbook {
  const workbook = XLSX.read(buffer, { type: 'array' });

  const sheets: ParsedSheet[] = workbook.SheetNames.map((sheetName) => {
    const worksheet = workbook.Sheets[sheetName];

    // Detect where the actual header row is
    const headerRowIndex = detectHeaderRow(worksheet);
    console.log(`[Excel] Sheet "${sheetName}" - detected header row: ${headerRowIndex + 1}`);

    // Get the range of the sheet
    const range = XLSX.utils.decode_range(worksheet['!ref'] || 'A1');

    // Extract headers from detected header row
    const headers: string[] = [];
    for (let col = range.s.c; col <= range.e.c; col++) {
      const cellAddress = XLSX.utils.encode_cell({ r: headerRowIndex, c: col });
      const cell = worksheet[cellAddress];
      headers.push(cell ? String(cell.v) : `Column ${col + 1}`);
    }

    // Convert to JSON starting from the header row
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(worksheet, {
      defval: null,
      range: headerRowIndex,
    });

    // Skip the first row if it contains the headers themselves
    const dataRows = rows.length > 0 && rows[0] ? rows.slice(1) : rows;

    // Get sample rows (first 10 for better AI understanding)
    const sampleRows = dataRows.slice(0, 10);

    return {
      name: sheetName,
      headers,
      rows: dataRows,
      sampleRows,
    };
  });

  return {
    id: generateId(),
    filename,
    sheets,
  };
}

export function getSheetNames(workbook: ParsedWorkbook): string[] {
  return workbook.sheets.map((s) => s.name);
}

export function getSheetByName(workbook: ParsedWorkbook, sheetName: string): ParsedSheet | undefined {
  return workbook.sheets.find((s) => s.name === sheetName);
}

export function getColumnData(sheet: ParsedSheet, columnName: string): unknown[] {
  return sheet.rows.map((row) => row[columnName]);
}

export function getSheetStructure(sheet: ParsedSheet): {
  headers: string[];
  sampleRows: Record<string, unknown>[];
  totalRows: number;
} {
  return {
    headers: sheet.headers,
    sampleRows: sheet.sampleRows,
    totalRows: sheet.rows.length,
  };
}

export function findNumericColumns(sheet: ParsedSheet): string[] {
  const numericColumns: string[] = [];

  for (const header of sheet.headers) {
    const values = getColumnData(sheet, header);
    const numericCount = values.filter((v) => typeof v === 'number').length;

    // If more than 50% of values are numeric, consider it a numeric column
    if (numericCount > values.length * 0.5) {
      numericColumns.push(header);
    }
  }

  return numericColumns;
}

export function findDescriptionColumns(sheet: ParsedSheet): string[] {
  const descriptionColumns: string[] = [];
  const keywords = ['description', 'item', 'name', 'detail', 'scope', 'work'];

  for (const header of sheet.headers) {
    const lowerHeader = header.toLowerCase();
    if (keywords.some((kw) => lowerHeader.includes(kw))) {
      descriptionColumns.push(header);
    }
  }

  // If no keyword matches, look for columns with long text values
  if (descriptionColumns.length === 0) {
    for (const header of sheet.headers) {
      const values = getColumnData(sheet, header);
      const textValues = values.filter((v) => typeof v === 'string' && v.length > 20);

      if (textValues.length > values.length * 0.3) {
        descriptionColumns.push(header);
      }
    }
  }

  return descriptionColumns;
}

export function findAmountColumns(sheet: ParsedSheet): string[] {
  const amountColumns: string[] = [];
  const keywords = ['total', 'amount', 'cost', 'price', 'value', 'sum', 'extended'];

  const numericColumns = findNumericColumns(sheet);

  for (const header of numericColumns) {
    const lowerHeader = header.toLowerCase();
    if (keywords.some((kw) => lowerHeader.includes(kw))) {
      amountColumns.push(header);
    }
  }

  return amountColumns;
}

/**
 * Detect if a row is a subtotal, total, or section header row
 * These should be excluded from line item analysis to avoid double-counting
 */
export function isAggregateRow(description: string): boolean {
  if (!description) return true;

  const lower = description.toLowerCase().trim();

  // Patterns that indicate aggregate/summary rows
  const aggregatePatterns = [
    /\bsubtotal\b/,
    /\bsub-total\b/,
    /\bsub total\b/,
    /^total\b/,
    /\btotal\s*$/,
    /\btotal\s*[-:]/,
    /\bgrand\s*total\b/,
    /\bhard\s*cost.*total/,
    /\bsoft\s*cost.*total/,
    /\bproject\s*total\b/,
    /\bcontract\s*total\b/,
    /\bconstruction\s*total\b/,
    /\bdivision\s+\d+\s*total/i,
    /\bdivision\s+\d+\s*-?\s*$/,  // "Division 01" or "Division 01 -" without description
    /^\d{2}\s*0000\s*$/,           // CSI code like "01 0000" (section headers)
    /^division\s+\d+$/i,           // Just "Division 01"
  ];

  // Check if any pattern matches
  for (const pattern of aggregatePatterns) {
    if (pattern.test(lower)) {
      return true;
    }
  }

  // Also check for rows that are ONLY a number pattern (like CSI codes without description)
  if (/^\d{2}\s+\d{4}$/.test(lower.trim())) {
    return true;
  }

  return false;
}
