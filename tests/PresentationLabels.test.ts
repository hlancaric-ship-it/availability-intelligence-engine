import { describe, test, expect } from 'vitest';
import { StatusLabels, getStatusLabel, getActorLabel } from '../src/platform/operations/labels.js';

describe('Presentation Layer - E-shopper First Labels', () => {
    test('translates domain and workflow statuses into Czech e-shopper labels', () => {
        expect(getStatusLabel('READY_TO_FULFILL').label).toBe('Připraveno k zabalení');
        expect(getStatusLabel('PENDING_APPROVAL').label).toBe('Čeká na schválení nákupu');
        expect(getStatusLabel('WAITING_FOR_STOCK').label).toBe('Čeká na dodání zboží');
        expect(getStatusLabel('PARTIALLY_RECEIVED').label).toBe('Částečně naskladněno');
        expect(getStatusLabel('RECEIVED').label).toBe('Kompletně naskladněno');
        expect(getStatusLabel('SENT').label).toBe('Odesláno dodavateli');
    });

    test('handles exceptions with helpful action hints', () => {
        const exc = getStatusLabel('ANY', true);
        expect(exc.label).toBe('Vyžaduje kontrolu');
        expect(exc.badgeClass).toBe('status-exception');
        expect(exc.actionHint).toBeDefined();
    });

    test('maps actors to clear Czech descriptions', () => {
        expect(getActorLabel('SYSTEM')).toContain('Automatický systém');
        expect(getActorLabel('USER')).toContain('Ruční úprava uživatelem');
    });
});
