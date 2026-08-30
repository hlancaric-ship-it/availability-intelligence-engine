import { describe, it, expect, beforeEach } from "vitest";
import { SupplierMappingService } from "../src/core/procurement/SupplierMappingService.js";

describe("SupplierMappingService & Operational Configuration Layer", () => {
    let service: SupplierMappingService;

    beforeEach(() => {
        service = new SupplierMappingService();
    });

    it("allows creating and listing suppliers with operational attributes", () => {
        const created = service.addSupplier({
            id: "SUP-MILTEC",
            name: "Mil-Tec CZ",
            status: "ACTIVE",
            statusLabel: "Aktivní partner",
            categoryDescription: "Taktická výstroj a batohy",
            priority: 4,
            leadTimeDays: 2,
            leadTimeLabel: "2 pracovní dny",
            minOrderAmountCzk: 2000,
            minOrderLabel: "2 000 Kč",
            orderMethod: "B2B portál",
            lastCatalogSync: "Dnes v 10:00",
            mappedProductsCount: 0,
            contactEmail: "b2b@miltec.cz",
        });

        expect(created.name).toBe("Mil-Tec CZ");
        expect(service.getSupplier("SUP-MILTEC")?.minOrderAmountCzk).toBe(2000);
        expect(service.getSuppliers().length).toBe(4);
    });

    it("supports mapping a specific product variant to a supplier", () => {
        const mapping = service.addMapping({
            id: "MAP-NEW-01",
            productId: "PROD-TRIKO-HEAVY",
            productName: "Čistý triko Heavy",
            variantId: "VAR-WHT-L",
            variantName: "Bílá / L",
            eshopSku: "TRIKO-HEAVY-WHT-L",
            supplierId: "SUP-FOX",
            supplierName: "Fox Outdoor",
            supplierSku: "FOX-HVY-WHT-L",
            purchasePriceCzk: 150,
            supplierStock: 30,
            leadTimeDays: 1,
            priority: 1,
            active: true,
        });

        expect(mapping.supplierSku).toBe("FOX-HVY-WHT-L");
        const found = service.getMappingsForVariant("TRIKO-HEAVY-WHT-L");
        expect(found.length).toBe(1);
        expect(found[0].variantName).toBe("Bílá / L");
    });

    it("supports multiple suppliers for a single product variant and sorts by priority", () => {
        const mappings = service.getMappingsForVariant("TRIKO-BASIC-BLK-M");
        expect(mappings.length).toBe(2);
        expect(mappings[0].supplierName).toBe("Fox Outdoor");
        expect(mappings[0].priority).toBe(1);
        expect(mappings[1].supplierName).toBe("Brandit CZ");
        expect(mappings[1].priority).toBe(2);
    });

    it("allows updating supplier priority and mapping attributes", () => {
        service.updateSupplier("SUP-BRANDIT", { priority: 1 });
        expect(service.getSupplier("SUP-BRANDIT")?.priority).toBe(1);

        const mapping = service.getAllMappings().find((m) => m.id === "MAP-002");
        expect(mapping).toBeDefined();
        if (mapping) {
            service.updateMapping("MAP-002", { priority: 1, purchasePriceCzk: 125 });
            const updated = service.getAllMappings().find((m) => m.id === "MAP-002");
            expect(updated?.purchasePriceCzk).toBe(125);
            expect(updated?.priority).toBe(1);
        }
    });

    it("records and audits manual interventions (supplier override, quantity, reasons)", () => {
        const audit = service.recordIntervention({
            targetType: "SUPPLIER_SELECTION",
            targetId: "OBJ-DOD-2026-08-001",
            orderId: "OBJ-2026-001245",
            originalValue: "Fox Outdoor (10 ks)",
            newValue: "Brandit CZ (10 ks)",
            reason: "Požadavek zákazníka na expresní záložní naskladnění",
            user: "Jan E-shopař",
        });

        expect(audit.id).toContain("AUDIT-");
        expect(audit.originalValue).toBe("Fox Outdoor (10 ks)");
        expect(audit.newValue).toBe("Brandit CZ (10 ks)");

        const trail = service.getAuditTrail();
        expect(trail.length).toBe(1);
        expect(trail[0].user).toBe("Jan E-shopař");
    });

    it("allows configuring procurement rules and strategies with clear business meaning", () => {
        const updated = service.updateSettings({
            defaultStrategy: "FASTEST",
            allowMultiSupplierSplit: true,
            autoApprovalThresholdCzk: 5000,
        });

        expect(updated.defaultStrategy).toBe("FASTEST");
        expect(updated.autoApprovalThresholdCzk).toBe(5000);
        expect(service.getSettings().allowMultiSupplierSplit).toBe(true);
    });
});
