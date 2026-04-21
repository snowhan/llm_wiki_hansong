import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, fireEvent, waitFor } from "@testing-library/react"
import { act } from "react"
import { CreateProjectDialog } from "../project/create-project-dialog"
import { createProject } from "@/commands/fs"

vi.mock("@/commands/fs", () => ({
  readFile: vi.fn(),
  writeFile: vi.fn(),
  deleteFile: vi.fn(),
  listDirectory: vi.fn(),
  createDirectory: vi.fn(),
  exists: vi.fn(),
  rename: vi.fn(),
  createProject: vi.fn().mockResolvedValue(undefined),
}))

vi.mock("@/lib/templates", () => ({
  getTemplate: vi.fn().mockReturnValue({
    id: "general",
    schema: "schema",
    purpose: "purpose",
    extraDirs: [],
  }),
}))

vi.mock("../project/template-picker", () => ({
  TemplatePicker: ({ onSelect }: { onSelect: (id: string) => void }) => (
    <button type="button" data-testid="tpl" onClick={() => onSelect("general")}>
      Pick
    </button>
  ),
}))

vi.mock("@/lib/api-client", () => ({
  apiGet: vi.fn().mockResolvedValue({ projectsRoot: "/data/projects" }),
  apiPut: vi.fn(),
}))

// ServerDirBrowser is modal — stub it to expose the initialPath prop for inspection
vi.mock("../project/server-dir-browser", () => ({
  ServerDirBrowser: ({ initialPath, open }: { initialPath?: string; open: boolean }) =>
    open ? <div data-testid="dir-browser" data-initial-path={initialPath} /> : null,
}))

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(createProject).mockResolvedValue({
    name: "N",
    path: "/parent/N",
  } as any)
})

describe("CreateProjectDialog", () => {
  it("renders when open is true", () => {
    render(
      <CreateProjectDialog open onOpenChange={vi.fn()} onCreated={vi.fn()} />,
    )
    expect(screen.getByText("project.createTitle")).toBeInTheDocument()
  })

  it("does not render dialog content when open is false", () => {
    render(
      <CreateProjectDialog open={false} onOpenChange={vi.fn()} onCreated={vi.fn()} />,
    )
    expect(screen.queryByText("project.createTitle")).not.toBeInTheDocument()
  })

  it("shows an error when the name is empty", async () => {
    render(
      <CreateProjectDialog open onOpenChange={vi.fn()} onCreated={vi.fn()} />,
    )

    const pathInput = screen.getByPlaceholderText("project.parentDirPlaceholder")
    await act(async () => {
      fireEvent.change(pathInput, { target: { value: "/some/parent" } })
    })

    await act(async () => {
      fireEvent.click(screen.getByText("project.create"))
    })

    await waitFor(() => {
      expect(screen.getByText("project.namePathRequired")).toBeInTheDocument()
    })
  })

  it("pre-fills path input with projectsRoot fetched from API", async () => {
    const { apiGet } = await import("@/lib/api-client")
    vi.mocked(apiGet).mockResolvedValue({ projectsRoot: "/data/projects" })

    render(<CreateProjectDialog open onOpenChange={vi.fn()} onCreated={vi.fn()} />)

    await waitFor(() => {
      const input = screen.getByPlaceholderText("project.parentDirPlaceholder") as HTMLInputElement
      expect(input.value).toBe("/data/projects")
    })
  })

  it("passes projectsRoot as initialPath to ServerDirBrowser when browse is open", async () => {
    const { apiGet } = await import("@/lib/api-client")
    vi.mocked(apiGet).mockResolvedValue({ projectsRoot: "/data/projects" })

    render(<CreateProjectDialog open onOpenChange={vi.fn()} onCreated={vi.fn()} />)

    // wait for projectsRoot to load
    await waitFor(() => {
      const input = screen.getByPlaceholderText("project.parentDirPlaceholder") as HTMLInputElement
      expect(input.value).toBe("/data/projects")
    })

    // open the dir browser
    const browseBtn = screen.getByRole("button", { name: "" })
    await act(async () => { fireEvent.click(browseBtn) })

    await waitFor(() => {
      const browser = screen.getByTestId("dir-browser")
      expect(browser).toHaveAttribute("data-initial-path", "/data/projects")
    })
  })
})
