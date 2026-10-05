'use strict';

// =============================================================================
// Algerian Communes Normalizer & Redex Resolver
// Resolves Arabic/French commune inputs to Redex's official database names
// =============================================================================

const path = require('path');
const fs = require('fs');

let redexCommunes = [];
let dzCommunes = [];

try {
    const redexPath = path.join(__dirname, 'redex_communes.json');
    if (fs.existsSync(redexPath)) {
        const raw = JSON.parse(fs.readFileSync(redexPath, 'utf8'));
        redexCommunes = Object.values(raw);
    }
} catch (e) {
    console.warn('[communesMapper] Failed to load redex_communes.json:', e.message);
}

try {
    const dzPath = path.join(__dirname, 'communes.json');
    if (fs.existsSync(dzPath)) {
        dzCommunes = JSON.parse(fs.readFileSync(dzPath, 'utf8'));
    }
} catch (e) {
    console.warn('[communesMapper] Failed to load communes.json:', e.message);
}

function normalizeText(txt) {
    if (!txt) return '';
    return txt.toString().toLowerCase()
        .replace(/[éèêë]/g, 'e')
        .replace(/[àâä]/g, 'a')
        .replace(/[îï]/g, 'i')
        .replace(/[ôö]/g, 'o')
        .replace(/[ùûü]/g, 'u')
        .replace(/ç/g, 'c')
        .replace(/['’\-_\s]+/g, ' ')
        .trim();
}

/**
 * Resolves an Arabic or French commune name into Redex's official spelling.
 * @param {number|string} wilayaCode - Wilaya code (1 to 58)
 * @param {string} inputName - Name in Arabic or French
 * @returns {string} - The official Redex commune name
 */
function resolveRedexCommune(wilayaCode, inputName) {
    const wCode = parseInt(wilayaCode);
    const wRedex = redexCommunes.filter(c => c.wilaya_id === wCode);
    if (!wRedex.length) return inputName || 'Alger Centre';

    const cleanInput = (inputName || '').trim();
    if (!cleanInput) return wRedex[0]?.nom || 'Centre';

    const normInput = normalizeText(cleanInput);

    // 1. Direct exact or normalized match in Redex
    const direct = wRedex.find(c => normalizeText(c.nom) === normInput);
    if (direct) return direct.nom;

    // 2. Arabic match via dzCommunes
    const arMatch = dzCommunes.find(c =>
        c.wilayaCode === wCode &&
        (c.nameAr === cleanInput || cleanInput.includes(c.nameAr) || c.nameAr.includes(cleanInput))
    );
    if (arMatch) {
        const fromFrench = wRedex.find(c => normalizeText(c.nom) === normalizeText(arMatch.name));
        if (fromFrench) return fromFrench.nom;
    }

    // 3. Partial match in Redex
    const partial = wRedex.find(c =>
        normInput.includes(normalizeText(c.nom)) || normalizeText(c.nom).includes(normInput)
    );
    if (partial) return partial.nom;

    // 4. Default to first valid commune of that Wilaya
    return wRedex[0]?.nom || cleanInput;
}

module.exports = {
    resolveRedexCommune,
    normalizeText
};
