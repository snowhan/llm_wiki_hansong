import { Extension } from "@tiptap/core"
import { ReactRenderer } from "@tiptap/react"
import Suggestion from "@tiptap/suggestion"
import type { SuggestionOptions } from "@tiptap/suggestion"
import tippy from "tippy.js"
import type { Instance as TippyInstance } from "tippy.js"
import { CommandList } from "./slash-commands"
import type { CommandListHandle } from "./slash-commands"
import type { SlashItem } from "./slash-items"

// tippy.js is a peer dependency of @tiptap/extension-floating-menu
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let tippyLib: typeof tippy | null = null
async function getTippy() {
  if (!tippyLib) {
    const mod = await import("tippy.js")
    tippyLib = mod.default
  }
  return tippyLib
}

const suggestion: Partial<SuggestionOptions<SlashItem>> = {
  char: "/",
  allowSpaces: false,

  command({ editor, range, props }) {
    editor
      .chain()
      .focus()
      .deleteRange(range)
      .run()
    ;(props as SlashItem).command(editor)
  },

  render() {
    let renderer: ReactRenderer<CommandListHandle> | null = null
    let popup: TippyInstance[] | null = null

    return {
      onStart(props) {
        renderer = new ReactRenderer(CommandList, {
          props,
          editor: props.editor,
        })

        if (!props.clientRect) return

        getTippy().then((tippyFn) => {
          popup = tippyFn("body", {
            getReferenceClientRect: props.clientRect as () => DOMRect,
            appendTo: () => document.body,
            content: renderer!.element,
            showOnCreate: true,
            interactive: true,
            trigger: "manual",
            placement: "bottom-start",
            animation: false,
          })
        })
      },

      onUpdate(props) {
        renderer?.updateProps(props)
        if (!props.clientRect || !popup) return
        popup[0]?.setProps({ getReferenceClientRect: props.clientRect as () => DOMRect })
      },

      onKeyDown(props) {
        if (props.event.key === "Escape") {
          popup?.[0]?.hide()
          return true
        }
        return renderer?.ref?.onKeyDown(props) ?? false
      },

      onExit() {
        popup?.[0]?.destroy()
        renderer?.destroy()
        popup = null
        renderer = null
      },
    }
  },
}

export const SlashCommandsExtension = Extension.create({
  name: "slashCommands",

  addOptions() {
    return { suggestion }
  },

  addProseMirrorPlugins() {
    return [
      Suggestion({
        editor: this.editor,
        ...this.options.suggestion,
      }),
    ]
  },
})
