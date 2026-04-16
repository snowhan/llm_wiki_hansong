import { useSyncExternalStore } from "react"

function subscribe(cb: () => void) {
  const mq = window.matchMedia("(prefers-color-scheme: dark)")
  mq.addEventListener("change", cb)

  const observer = new MutationObserver(cb)
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["class"],
  })

  return () => {
    mq.removeEventListener("change", cb)
    observer.disconnect()
  }
}

function getSnapshot() {
  return document.documentElement.classList.contains("dark")
}

export function useIsDark(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, () => true)
}
