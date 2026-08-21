'use strict';
// =============================================================================
// Local Excel Storage Service — Yamaha Sac / ORVA Store
// Drop-in replacement & simulator for Google Sheets API using local .xlsx files
// =============================================================================

const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');

const DATA_DIR = path.join(__dirname, '..', 'data');
const EXCEL_DIR = path.join(DATA_DIR, 'excel');

function ensureExcelDir() {
    if (!fs.existsSync(EXCEL_DIR)) {
        fs.mkdirSync(EXCEL_DIR, { recursive: true });
    }
}

// Maps sheet name to local file name
function getExcelPathForSheet(tabName) {
    ensureExcelDir();
    const cleanTab = (tabName || 'Orders').trim();
    // Check if individual file exists e.g. data/excel/Orders.xlsx
    const individual = path.join(EXCEL_DIR, `${cleanTab}.xlsx`);
    if (fs.existsSync(individual)) return { file: individual, tab: cleanTab };

    // Fallback to unified workbook
    const unified = path.join(EXCEL_DIR, 'GoogleSheets_Simulated.xlsx');
    return { file: unified, tab: cleanTab };
}

function readWorkbook(filePath) {
    if (!fs.existsSync(filePath)) {
        const wb = XLSX.utils.book_new();
        return wb;
    }
    return XLSX.readFile(filePath);
}

function writeWorkbook(wb, filePath) {
    ensureExcelDir();
    XLSX.writeFile(wb, filePath);
}

// ── Low-Level Operations ──────────────────────────────────────────────────────

async function getRows(sheetConfig) {
    try {
        const tabName = sheetConfig.tab || 'Orders';
        const { file, tab } = getExcelPathForSheet(tabName);
        
        if (!fs.existsSync(file)) return [];
        const wb = readWorkbook(file);
        const ws = wb.Sheets[tab] || wb.Sheets[wb.SheetNames[0]];
        if (!ws) return [];

        // Read sheet to array of arrays
        const aoa = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
        if (aoa.length === 0) return [];

        const headers = aoa[0];
        const dataRows = aoa.slice(1);

        return dataRows.map((row, idx) => {
            const obj = { _rowIndex: idx + 2 };
            headers.forEach((h, i) => {
                obj[h] = row[i] !== undefined ? String(row[i]) : '';
            });
            return obj;
        });
    } catch (e) {
        console.warn(`[LocalExcel] getRows(${sheetConfig.tab}) error:`, e.message);
        return [];
    }
}

async function getHeaders(sheetConfig) {
    try {
        const tabName = sheetConfig.tab || 'Orders';
        const { file, tab } = getExcelPathForSheet(tabName);
        if (!fs.existsSync(file)) return sheetConfig.defaultHeaders || [];

        const wb = readWorkbook(file);
        const ws = wb.Sheets[tab] || wb.Sheets[wb.SheetNames[0]];
        if (!ws) return sheetConfig.defaultHeaders || [];

        const aoa = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
        if (aoa.length > 0 && aoa[0].length > 0) {
            return aoa[0];
        }
        return sheetConfig.defaultHeaders || [];
    } catch (e) {
        return sheetConfig.defaultHeaders || [];
    }
}

async function appendRow(sheetConfig, rowData) {
    try {
        const tabName = sheetConfig.tab || 'Orders';
        const { file, tab } = getExcelPathForSheet(tabName);
        let wb = readWorkbook(file);
        
        let ws = wb.Sheets[tab];
        let headers = sheetConfig.defaultHeaders || [];
        let rows = [];

        if (ws) {
            const aoa = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
            if (aoa.length > 0) {
                headers = aoa[0];
                rows = aoa;
            } else {
                rows = [headers];
            }
        } else {
            rows = [headers];
        }

        const newRow = headers.map(h => {
            const val = rowData[h];
            if (val === null || val === undefined) return '';
            if (typeof val === 'object') return JSON.stringify(val);
            return String(val);
        });

        rows.push(newRow);

        const newWs = XLSX.utils.aoa_to_sheet(rows);
        if (ws) {
            wb.Sheets[tab] = newWs;
        } else {
            XLSX.utils.book_append_sheet(wb, newWs, tab);
        }

        writeWorkbook(wb, file);
        return true;
    } catch (e) {
        console.warn(`[LocalExcel] appendRow(${sheetConfig.tab}) error:`, e.message);
        return false;
    }
}

async function updateRow(sheetConfig, rowIndex, updateData) {
    try {
        const tabName = sheetConfig.tab || 'Orders';
        const { file, tab } = getExcelPathForSheet(tabName);
        if (!fs.existsSync(file)) return false;

        const wb = readWorkbook(file);
        const ws = wb.Sheets[tab] || wb.Sheets[wb.SheetNames[0]];
        if (!ws) return false;

        const aoa = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
        if (aoa.length < rowIndex) return false; // rowIndex is 1-indexed (header is 1)

        const headers = aoa[0];
        const targetRow = aoa[rowIndex - 1];

        headers.forEach((h, colIdx) => {
            if (Object.prototype.hasOwnProperty.call(updateData, h)) {
                let val = updateData[h];
                if (val === null || val === undefined) val = '';
                else if (typeof val === 'object') val = JSON.stringify(val);
                else val = String(val);
                targetRow[colIdx] = val;
            }
        });

        const newWs = XLSX.utils.aoa_to_sheet(aoa);
        wb.Sheets[tab] = newWs;
        writeWorkbook(wb, file);
        return true;
    } catch (e) {
        console.warn(`[LocalExcel] updateRow error:`, e.message);
        return false;
    }
}

async function findAndUpdateRow(sheetConfig, matchFn, updateData) {
    const rows = await getRows(sheetConfig);
    const target = rows.find(matchFn);
    if (!target) return null;
    const ok = await updateRow(sheetConfig, target._rowIndex, updateData);
    return ok ? { ...target, ...updateData } : null;
}

async function findRows(sheetConfig, matchFn) {
    const rows = await getRows(sheetConfig);
    return rows.filter(matchFn);
}

async function deleteRow(sheetConfig, rowIndex) {
    try {
        const tabName = sheetConfig.tab || 'Orders';
        const { file, tab } = getExcelPathForSheet(tabName);
        if (!fs.existsSync(file)) return false;

        const wb = readWorkbook(file);
        const ws = wb.Sheets[tab] || wb.Sheets[wb.SheetNames[0]];
        if (!ws) return false;

        const aoa = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
        if (aoa.length < rowIndex) return false;

        aoa.splice(rowIndex - 1, 1);
        const newWs = XLSX.utils.aoa_to_sheet(aoa);
        wb.Sheets[tab] = newWs;
        writeWorkbook(wb, file);
        return true;
    } catch (e) {
        console.warn(`[LocalExcel] deleteRow error:`, e.message);
        return false;
    }
}

async function verifyConnection() {
    ensureExcelDir();
    const files = ['Orders.xlsx', 'Customers.xlsx', 'Watchlist.xlsx', 'RiskEvents.xlsx'];
    const results = [];

    for (const f of files) {
        const p = path.join(EXCEL_DIR, f);
        const exists = fs.existsSync(p);
        results.push({
            name: f.replace('.xlsx', ''),
            file: f,
            ok: exists,
            status: exists ? 'LOCAL_EXCEL_READY' : 'FILE_MISSING'
        });
    }

    return {
        ok: results.every(r => r.ok),
        isLocal: true,
        mode: 'Local Excel Simulation',
        excelDir: EXCEL_DIR,
        results
    };
}

module.exports = {
    getRows,
    getHeaders,
    appendRow,
    updateRow,
    findAndUpdateRow,
    findRows,
    deleteRow,
    verifyConnection
};
