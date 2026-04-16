"use client"

import * as React from "react"
import { isValidElement, Children } from "react"
import MuiTooltip, { type TooltipProps as MuiTooltipProps } from "@mui/material/Tooltip"
import Box from "@mui/material/Box"

const TooltipDelayContext = React.createContext<{ enterDelay: number; leaveDelay: number }>({
  enterDelay: 0,
  leaveDelay: 0,
})

export type TooltipProviderProps = {
  children?: React.ReactNode
  /** @deprecated Use `delayDuration` (matches common Radix-style APIs). */
  delay?: number
  /** Show tooltip after this many ms (maps to MUI `enterDelay`). */
  delayDuration?: number
}

function TooltipProvider({ children, delay = 0, delayDuration }: TooltipProviderProps) {
  const enterDelay = delayDuration ?? delay ?? 0
  const value = React.useMemo(() => ({ enterDelay, leaveDelay: 0 }), [enterDelay])
  return (
    <TooltipDelayContext.Provider value={value}>
      <Box data-slot="tooltip-provider" sx={{ display: "contents" }}>
        {children}
      </Box>
    </TooltipDelayContext.Provider>
  )
}

const TRIGGER_NAME = "TooltipTrigger"
const CONTENT_NAME = "TooltipContent"

export type TooltipContentProps = {
  children?: React.ReactNode
  side?: "top" | "bottom" | "left" | "right" | "inline-start" | "inline-end"
  sideOffset?: number
  align?: "start" | "center" | "end"
  alignOffset?: number
  className?: string
}

export type TooltipRootProps = Omit<MuiTooltipProps, "title" | "children"> & {
  children?: React.ReactNode
}

function Tooltip({ children, ...muiProps }: TooltipRootProps) {
  const { enterDelay, leaveDelay } = React.useContext(TooltipDelayContext)

  let trigger: React.ReactElement | null = null
  let title: React.ReactNode = null
  let placement: MuiTooltipProps["placement"] = "top"

  Children.forEach(children, (child) => {
    if (!isValidElement(child)) return
    const name = (child.type as { displayName?: string }).displayName
    if (name === TRIGGER_NAME) {
      trigger = child
    } else if (name === CONTENT_NAME) {
      const p = child.props as TooltipContentProps
      title = p.children
      placement = mapSideToPlacement(p.side)
    }
  })

  if (!trigger) {
    return null
  }

  const hasTitle = title != null && title !== ""

  return (
    <MuiTooltip
      {...muiProps}
      data-slot="tooltip"
      title={title ?? ""}
      placement={placement}
      enterDelay={enterDelay}
      leaveDelay={leaveDelay}
      disableHoverListener={!hasTitle}
      disableFocusListener={!hasTitle}
      disableTouchListener={!hasTitle}
    >
      {trigger}
    </MuiTooltip>
  )
}

function mapSideToPlacement(side: TooltipContentProps["side"]): MuiTooltipProps["placement"] {
  switch (side) {
    case "top":
      return "top"
    case "bottom":
      return "bottom"
    case "left":
      return "left"
    case "right":
      return "right"
    case "inline-start":
      return "left"
    case "inline-end":
      return "right"
    default:
      return "top"
  }
}

export type TooltipTriggerProps = React.ComponentPropsWithoutRef<"button">

const TooltipTrigger = React.forwardRef<HTMLButtonElement, TooltipTriggerProps>(
  function TooltipTrigger({ type = "button", ...props }, ref) {
    return <button ref={ref} type={type} data-slot="tooltip-trigger" {...props} />
  }
)
TooltipTrigger.displayName = TRIGGER_NAME

function TooltipContent(_props: TooltipContentProps) {
  return null
}
TooltipContent.displayName = CONTENT_NAME

export { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider }
