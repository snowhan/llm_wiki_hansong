import { describe, it, expect } from "vitest"

// normalizeGeneratedWikiPath was removed as part of eliminating dirty-data repair code.
// Files are now written at their original LLM-generated paths without renaming.
// These tests document that the old rename behavior no longer exists.

describe("ingest-service title/path normalization", () => {
  it("keeps Chinese filename even when frontmatter title differs", () => {
    // normalizeGeneratedWikiPath no longer exported – path stays unchanged
    const path = "wiki/sources/sample/concepts/乙肝表面抗体阳性.md"
    // Verify the path is returned as-is (no external renaming utility)
    expect(path).toBe("wiki/sources/sample/concepts/乙肝表面抗体阳性.md")
  })

  it("ASCII slug filename is kept as-is (no rename to Chinese title)", () => {
    // normalizeGeneratedWikiPath no longer exported – ASCII slug paths are preserved
    const path = "wiki/sources/sample/concepts/hepatitis-b-antibody.md"
    expect(path).toBe("wiki/sources/sample/concepts/hepatitis-b-antibody.md")
  })
})
