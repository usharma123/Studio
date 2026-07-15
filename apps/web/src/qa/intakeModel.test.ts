import type { QaDocument } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import { documentKindChecklist, documentVersion, persistedDocumentKind } from "./intakeModel";

const document = (fields: Record<string, unknown>) => fields as unknown as QaDocument;

describe("QA intake classification", () => {
  it("prefers persisted classification and version metadata", () => {
    const brd = document({ fileName: "scope.docx", kind: "BRD", version: "3.1" });
    expect(persistedDocumentKind(brd)).toBe("BRD");
    expect(documentVersion(brd)).toBe("3.1");
    expect(documentKindChecklist([brd])[0]?.status).toBe("classified");
  });

  it("labels filename matches as suggestions rather than durable classification", () => {
    const hld = document({ fileName: "Payments_HLD_v2.pdf" });
    const checklist = documentKindChecklist([hld]);
    expect(checklist.find((item) => item.kind === "HLD")?.status).toBe("suggested");
    expect(checklist.find((item) => item.kind === "LLD")?.status).toBe("missing");
  });
});
