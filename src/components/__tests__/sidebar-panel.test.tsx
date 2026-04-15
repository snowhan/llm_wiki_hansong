import { describe, it, expect, vi } from "vitest"
import { render, screen, fireEvent } from "@testing-library/react"
import { SidebarPanel } from "../layout/sidebar-panel"

vi.mock("../layout/knowledge-tree", () => ({
  KnowledgeTree: () => <div data-testid="knowledge-tree">KnowledgeTree</div>,
}))
vi.mock("../layout/file-tree", () => ({
  FileTree: () => <div data-testid="file-tree">FileTree</div>,
}))

describe("SidebarPanel", () => {
  it("renders knowledge and files tabs", () => {
    render(<SidebarPanel />)
    expect(screen.getByText("sidebar.knowledge")).toBeTruthy()
    expect(screen.getByText("sidebar.files")).toBeTruthy()
  })

  it("shows KnowledgeTree by default", () => {
    render(<SidebarPanel />)
    expect(screen.getByTestId("knowledge-tree")).toBeTruthy()
  })

  it("switches to FileTree when files tab is clicked", () => {
    render(<SidebarPanel />)
    fireEvent.click(screen.getByText("sidebar.files"))
    expect(screen.getByTestId("file-tree")).toBeTruthy()
  })

  it("switches back to KnowledgeTree", () => {
    render(<SidebarPanel />)
    fireEvent.click(screen.getByText("sidebar.files"))
    fireEvent.click(screen.getByText("sidebar.knowledge"))
    expect(screen.getByTestId("knowledge-tree")).toBeTruthy()
  })
})
