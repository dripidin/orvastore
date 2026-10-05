'use strict';
const assert = require('assert');
const communes = require('../algeria-communes');

// Test wilaya 16 (Alger), 07 (Biskra), 31 (Oran)
assert(communes, 'Communes module must load');
assert(Array.isArray(communes['16']) && communes['16'].length > 0, 'Wilaya 16 (Alger) communes must exist');
assert(Array.isArray(communes['7']) && communes['7'].length > 0, 'Wilaya 7 (Biskra) communes must exist');
assert(Array.isArray(communes['31']) && communes['31'].length > 0, 'Wilaya 31 (Oran) communes must exist');

console.log('✅ Communes data integrity verified:');
console.log('- Wilaya 16 (Alger) has', communes['16'].length, 'communes: e.g.', communes['16'].slice(0, 5).join(', '));
console.log('- Wilaya 07 (Biskra) has', communes['7'].length, 'communes');
console.log('- Wilaya 31 (Oran) has', communes['31'].length, 'communes');
