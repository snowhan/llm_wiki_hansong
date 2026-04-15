import { describe, it, expect, vi } from "vitest"
import { render, screen, fireEvent } from "@testing-library/react"
import { TemplatePicker } from "../project/template-picker"
import { templates } from "@/lib/templates"

describe("TemplatePicker", () => {
  it("renders all 5 templates", () => {
    const onSelect = vi.fn()
    render(<TemplatePicker selected="research" onSelect={onSelect} />)
    for (const t of templates) {
      expect(screen.getByText(t.name)).toBeTruthy()
    }
    expect(templates).toHaveLength(5)
  })

  it("highlights the selected template", () => {
    const onSelect = vi.fn()
    const { container } = render(<TemplatePicker selected="reading" onSelect={onSelect} />)
    const buttons = container.querySelectorAll("button")
    const readingBtn = [...buttons].find((b) => b.textContent?.includes("Reading"))
    expect(readingBtn?.className).toMatch(/ring-primary/)
  })

  it("calls onSelect with template id on click", () => {
    const onSelect = vi.fn()
    render(<TemplatePicker selected="general" onSelect={onSelect} />)
    fireEvent.click(screen.getByRole("button", { name: /Personal Growth/i }))
    expect(onSelect).toHaveBeenCalledWith("personal")
  })
})
