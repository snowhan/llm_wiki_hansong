import { describe, it, expect, vi } from "vitest"
import type { ReactElement } from "react"
import { render, screen } from "@testing-library/react"
import { ErrorBoundary } from "../error-boundary"

function ThrowingComponent(): ReactElement {
  throw new Error("Test error")
}

function GoodComponent() {
  return <div>All good</div>
}

describe("ErrorBoundary", () => {
  it("renders children when no error", () => {
    render(
      <ErrorBoundary>
        <GoodComponent />
      </ErrorBoundary>,
    )
    expect(screen.getByText("All good")).toBeTruthy()
  })

  it("renders fallback on error", () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {})
    render(
      <ErrorBoundary>
        <ThrowingComponent />
      </ErrorBoundary>,
    )
    expect(screen.getByText("error.somethingWrong")).toBeTruthy()
    consoleSpy.mockRestore()
  })
})
