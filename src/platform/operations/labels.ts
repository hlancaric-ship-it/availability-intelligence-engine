/**
 * Presentation Layer: E-shopper First Labels and Dictionaries
 * Translates technical domain enums and codes into clear, natural Czech terminology.
 */

export interface LabelMetadata {
    label: string;
    description: string;
    badgeClass: 'status-pending' | 'status-ready' | 'status-warning' | 'status-exception' | 'status-info';
    actionHint?: string;
}

export const StatusLabels: Record<string, LabelMetadata> = {
    // 1. Customer Order / Fulfillment Statuses
    READY_TO_FULFILL: {
        label: 'Připraveno k zabalení',
        description: 'Všechny položky jsou 100% na skladě a přiřazené k objednávce. Můžete expedovat.',
        badgeClass: 'status-ready',
        actionHint: 'Vytiskněte štítek a zabalte balík pro zákazníka.',
    },
    READY_TO_SHIP: {
        label: 'Připraveno k zabalení',
        description: 'Všechny položky jsou na skladě a spárované s touto objednávkou.',
        badgeClass: 'status-ready',
        actionHint: 'Objednávka je kompletní a připravená k expedici.',
    },
    PARTIALLY_AVAILABLE: {
        label: 'Částečně skladem',
        description: 'Část položek je skladem, na zbývající kusy čekáme od dodavatele.',
        badgeClass: 'status-warning',
        actionHint: 'Zboží od dodavatele je na cestě.',
    },
    WAITING_FOR_STOCK: {
        label: 'Čeká na dodání zboží',
        description: 'Zboží není na skladě. Systém připravil objednávku u dodavatele.',
        badgeClass: 'status-pending',
        actionHint: 'Čekáme na schválení nebo doručení od dodavatele.',
    },

    // 2. Purchase Order / Procurement Statuses
    PENDING_APPROVAL: {
        label: 'Čeká na schválení nákupu',
        description: 'Systém automaticky navrhl nákup a čeká na vaše potvrzení k odeslání dodavateli.',
        badgeClass: 'status-pending',
        actionHint: 'Zkontrolujte položky a schvalte odeslání dodavateli.',
    },
    AUTO_APPROVED: {
        label: 'Automaticky schváleno',
        description: 'Nákupní objednávka byla automaticky schválena pravidlem e-shopu.',
        badgeClass: 'status-ready',
        actionHint: 'Objednávka byla zařazena k automatickému odeslání.',
    },
    SENT: {
        label: 'Odesláno dodavateli',
        description: 'Objednávka byla odeslána dodavateli. Čekáme na potvrzení a expedici.',
        badgeClass: 'status-info',
        actionHint: 'Dodavatel připravuje zásilku.',
    },
    DISPATCHED: {
        label: 'Odesláno dodavateli',
        description: 'Podklady byly předány dodavateli.',
        badgeClass: 'status-info',
    },
    PARTIALLY_RECEIVED: {
        label: 'Částečně naskladněno',
        description: 'Část zboží již dorazila a byla automaticky přiřazena k čekajícím objednávkám.',
        badgeClass: 'status-warning',
        actionHint: 'Zbývající kusy jsou stále na cestě.',
    },
    RECEIVED: {
        label: 'Kompletně naskladněno',
        description: 'Veškeré objednané zboží bylo v pořádku přijato na sklad.',
        badgeClass: 'status-ready',
        actionHint: 'Položky byly úspěšně přiřazeny k zákaznickým objednávkám.',
    },
    CANCELLED: {
        label: 'Zrušeno',
        description: 'Objednávka byla zrušena.',
        badgeClass: 'status-exception',
    },

    // 3. Exception & Audit types
    EXCEPTION: {
        label: 'Vyžaduje kontrolu',
        description: 'Nastala nesrovnalost (např. dodavatel nemá zboží nebo dorazil jiný počet kusů).',
        badgeClass: 'status-exception',
        actionHint: 'Zvolte náhradního dodavatele nebo upravte množství.',
    },
    SHORTAGE: {
        label: 'Chybí na skladě',
        description: 'Položka není v dostatečném množství na vlastním skladě.',
        badgeClass: 'status-warning',
    },
    RECONCILIATION_MISMATCH: {
        label: 'Neshoda při příjmu zboží',
        description: 'Fyzicky doručený počet kusů neodpovídá faktuře nebo objednávce.',
        badgeClass: 'status-exception',
    },
};

export function getStatusLabel(status: string, isException = false): LabelMetadata {
    if (isException) return StatusLabels.EXCEPTION!;
    return StatusLabels[status] ?? {
        label: status,
        description: 'Stav objednávky',
        badgeClass: 'status-pending',
    };
}

export const ActorLabels: Record<string, string> = {
    SYSTEM: '🤖 Automatický systém',
    USER: '👤 Ruční úprava uživatelem',
};

export function getActorLabel(actor: 'SYSTEM' | 'USER'): string {
    return ActorLabels[actor] ?? actor;
}
