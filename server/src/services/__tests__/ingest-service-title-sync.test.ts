import { describe, it, expect } from "vitest"

import { __ingestServiceTestUtils } from "../ingest-service.js"

describe("ingest-service title/path normalization", () => {
  it("keeps Chinese filename even when frontmatter title differs", () => {
    const content = [
      "---",
      "type: concept",
      "title: 代谢异常聚集",
      "---",
      "",
      "# 乙肝表面抗体阳性",
      "乙肝表面抗体：阳性",
    ].join("\n")

    const result = __ingestServiceTestUtils.normalizeGeneratedWikiPath(
      "wiki/sources/sample/concepts/乙肝表面抗体阳性.md",
      content,
    )

    expect(result).toBe("wiki/sources/sample/concepts/乙肝表面抗体阳性.md")
  })

  it("renames ASCII slug filename to Chinese title", () => {
    const content = [
      "---",
      "type: concept",
      "title: 乙肝表面抗体阳性",
      "---",
      "",
      "# 乙肝表面抗体阳性",
    ].join("\n")

    const result = __ingestServiceTestUtils.normalizeGeneratedWikiPath(
      "wiki/sources/sample/concepts/hepatitis-b-antibody.md",
      content,
    )

    expect(result).toBe("wiki/sources/sample/concepts/乙肝表面抗体阳性.md")
  })
})
