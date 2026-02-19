import { describe, expect, it } from 'vitest';
import { selectMicroEvent } from '../src/domain/events/microEventSelector.js';

describe('micro event selection', () => {
  it('avoids treasury payout micro events when treasury is empty', () => {
    expect(selectMicroEvent(0, () => 0.0)).toBe('pickpocket');
    expect(selectMicroEvent(0, () => 0.99)).toBe('tax_audit');
    expect(selectMicroEvent(-10, () => 0.6)).toBe('tax_audit');
  });

  it('allows claim rush but still includes tax audit when treasury is low', () => {
    expect(selectMicroEvent(50, () => 0.0)).toBe('pickpocket');
    expect(selectMicroEvent(50, () => 0.4)).toBe('claim_rush');
    expect(selectMicroEvent(50, () => 0.99)).toBe('tax_audit');
  });

  it('uses funded micro pool when treasury is healthy', () => {
    expect(selectMicroEvent(300, () => 0.0)).toBe('pickpocket');
    expect(selectMicroEvent(300, () => 0.4)).toBe('claim_rush');
    expect(selectMicroEvent(300, () => 0.99)).toBe('stimulus_drop');
  });
});

