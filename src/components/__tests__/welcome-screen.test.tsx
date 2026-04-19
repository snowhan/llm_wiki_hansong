import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, fireEvent, waitFor } from "@testing-library/react"
import { WelcomeScreen } from "../project/welcome-screen"

const recentMocks = vi.hoisted(() => ({
  getRecentProjects: vi.fn(),
  removeFromRecentProjects: vi.fn(),
}))

vi.mock("@/lib/project-store", () => ({
  getRecentProjects: recentMocks.getRecentProjects,
  removeFromRecentProjects: recentMocks.removeFromRecentProjects,
}))

describe("WelcomeScreen", () => {
  beforeEach(() => {
    recentMocks.getRecentProjects.mockReset()
    recentMocks.removeFromRecentProjects.mockReset()
    recentMocks.getRecentProjects.mockResolvedValue([])
  })

  it("renders new and open project actions", () => {
    render(
      <WelcomeScreen onCreateProject={vi.fn()} onOpenProject={vi.fn()} onSelectProject={vi.fn()} />,
    )
    expect(screen.getByText("welcome.newProject")).toBeTruthy()
    expect(screen.getByText("welcome.openProject")).toBeTruthy()
  })

  it("invokes callbacks when primary buttons are clicked", () => {
    const onCreateProject = vi.fn()
    const onOpenProject = vi.fn()
    render(
      <WelcomeScreen
        onCreateProject={onCreateProject}
        onOpenProject={onOpenProject}
        onSelectProject={vi.fn()}
      />,
    )
    fireEvent.click(screen.getByText("welcome.newProject"))
    fireEvent.click(screen.getByText("welcome.openProject"))
    expect(onCreateProject).toHaveBeenCalledTimes(1)
    expect(onOpenProject).toHaveBeenCalledTimes(1)
  })

  it("shows recent projects when the list is non-empty", async () => {
    recentMocks.getRecentProjects.mockResolvedValue([{ id: "abc123def456", name: "Old Wiki" }])
    render(
      <WelcomeScreen onCreateProject={vi.fn()} onOpenProject={vi.fn()} onSelectProject={vi.fn()} />,
    )
    await waitFor(() => {
      expect(screen.getByText("welcome.recentProjects")).toBeTruthy()
    })
    expect(screen.getByText("Old Wiki")).toBeTruthy()
    expect(screen.getByText("abc123de…")).toBeTruthy()
  })

  it("does not render nested button inside recent project item", async () => {
    recentMocks.getRecentProjects.mockResolvedValue([{ id: "abc123def456", name: "Old Wiki" }])
    const { container } = render(
      <WelcomeScreen onCreateProject={vi.fn()} onOpenProject={vi.fn()} onSelectProject={vi.fn()} />,
    )
    await screen.findByText("Old Wiki")
    expect(container.querySelector("button button")).toBeNull()
  })

  it("clicking remove button does not trigger project selection", async () => {
    recentMocks.getRecentProjects
      .mockResolvedValueOnce([{ id: "abc123def456", name: "Old Wiki" }])
      .mockResolvedValueOnce([])

    const onSelectProject = vi.fn()
    render(
      <WelcomeScreen onCreateProject={vi.fn()} onOpenProject={vi.fn()} onSelectProject={onSelectProject} />,
    )
    const removeButton = await screen.findByLabelText("common.close")
    fireEvent.click(removeButton)

    await waitFor(() => {
      expect(recentMocks.removeFromRecentProjects).toHaveBeenCalledWith("abc123def456")
    })
    expect(onSelectProject).not.toHaveBeenCalled()
  })
})
