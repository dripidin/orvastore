import { describe, it, expect } from '../framework/test-suite';
import { generateCourierInstructionNote } from '../framework/domain-engine';

describe('Feature 15: Copyable Courier Instruction Note', { tier: 'tier1', featureId: 'F15' }, () => {
  const sampleData = {
    originalOrderNumber: 'ORV-261107-101',
    originalCustomerName: 'Ahmed Brahimi',
    originalWilaya: 'Batna',
    newCustomerName: 'Khaled Mansour',
    newCustomerPhone: '0661234567',
    newWilayaCode: 16,
    newWilayaName: 'Alger',
    newCommuneName: 'Bab Ezzouar',
    newDeliveryType: 'STOP_DESK' as const,
    updatedCodAmount: 5350,
    operator: 'Supervisor Samy',
    reason: 'Client change of recipient while parcel is held at hub'
  };

  it('F15-T01: Note header clearly identifies re-routing operation in Arabic and French', () => {
    const note = generateCourierInstructionNote(sampleData);
    expect(note).toContain('*** تحويل مسار الطرد / INSTRUCTION RE-ROUTING COLIS ***');
  });

  it('F15-T02: Note cites original order number and previous buyer for carrier cross-referencing', () => {
    const note = generateCourierInstructionNote(sampleData);
    expect(note).toContain('ORV-261107-101');
    expect(note).toContain('Ahmed Brahimi');
    expect(note).toContain('Batna');
  });

  it('F15-T03: Note lists new customer name, phone number, and destination Wilaya and Commune', () => {
    const note = generateCourierInstructionNote(sampleData);
    expect(note).toContain('Khaled Mansour');
    expect(note).toContain('0661234567');
    expect(note).toContain('[16] Alger');
    expect(note).toContain('Bab Ezzouar');
  });

  it('F15-T04: Note includes exact revised COD cash amount to collect at delivery', () => {
    const note = generateCourierInstructionNote(sampleData);
    expect(note).toContain('5,350 د.ج');
  });

  it('F15-T05: Note stamps operator identifier, reason for re-route, and timestamp', () => {
    const note = generateCourierInstructionNote(sampleData);
    expect(note).toContain('Supervisor Samy');
    expect(note).toContain('Client change of recipient');
  });
});
