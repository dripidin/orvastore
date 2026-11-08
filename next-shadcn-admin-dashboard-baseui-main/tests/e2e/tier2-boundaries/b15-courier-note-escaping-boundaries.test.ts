import { describe, it, expect } from '../framework/test-suite';
import { generateCourierInstructionNote } from '../framework/domain-engine';

describe('Boundary B15: Courier Note Escaping & Character Fidelity', { tier: 'tier2', featureId: 'B15' }, () => {
  const baseNoteData = {
    originalOrderNumber: 'ORV-TEST-ESCAPE',
    originalCustomerName: 'M\'hamed "El-Habib" D.',
    originalWilaya: 'Batna',
    newCustomerName: 'عبد الرّحمن بن علي "المهندس"',
    newCustomerPhone: '0770123456',
    newWilayaCode: 16,
    newWilayaName: 'Alger',
    newCommuneName: 'Kouba',
    newDeliveryType: 'DOMICILE' as const,
    updatedCodAmount: 5450,
    operator: 'Operator <Admin>',
    reason: 'Customer request & courier agreement'
  };

  it('B15-T01: Customer name with quotes and Arabic Tashkeel renders without string escaping corruption', () => {
    const note = generateCourierInstructionNote(baseNoteData);
    expect(note).toContain('عبد الرّحمن بن علي "المهندس"');
  });

  it('B15-T02: Special HTML characters (<, >, &) render cleanly in plain-text note format', () => {
    const note = generateCourierInstructionNote(baseNoteData);
    expect(note).toContain('Operator <Admin>');
    expect(note).toContain('Customer request & courier agreement');
  });

  it('B15-T03: Multiline address in instruction note is preserved without breaking field layout', () => {
    const note = generateCourierInstructionNote({
      ...baseNoteData,
      newAddress: 'Batiment 12\nEtage 3\nPorte B'
    });
    expect(note).toContain('Batiment 12');
    expect(note).toContain('Etage 3');
  });

  it('B15-T04: Note structure incorporates prominent border dividers (*** and ---)', () => {
    const note = generateCourierInstructionNote(baseNoteData);
    expect(note).toContain('***');
    expect(note).toContain('---');
  });

  it('B15-T05: Phone number in courier note retains strictly digits without corrupting LTR/RTL reading', () => {
    const note = generateCourierInstructionNote(baseNoteData);
    expect(note).toContain('0770123456');
  });
});
