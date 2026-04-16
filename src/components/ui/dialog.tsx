"use client"

import * as React from "react"
import MuiDialog, { type DialogProps as MuiDialogProps } from "@mui/material/Dialog"
import MuiDialogContent from "@mui/material/DialogContent"
import MuiDialogTitle from "@mui/material/DialogTitle"
import Box from "@mui/material/Box"
import IconButton from "@mui/material/IconButton"
import CloseIcon from "@mui/icons-material/Close"
import type { SxProps, Theme } from "@mui/material/styles"
import { sxMerge } from "@/lib/mui-sx"
import i18n from "@/i18n"
import { Button } from "@/components/ui/button"

const DIALOG_TITLE_CLOSE_PADDING = 5

export type DialogProps = Omit<MuiDialogProps, "onClose"> & {
  onOpenChange?: (open: boolean) => void
}

const DialogContext = React.createContext<{
  onOpenChange?: (open: boolean) => void
}>({})

function Dialog({ open, onOpenChange, children, ...props }: DialogProps) {
  return (
    <DialogContext.Provider value={{ onOpenChange }}>
      <MuiDialog
        data-slot="dialog"
        open={Boolean(open)}
        onClose={(_e, reason) => {
          if (reason === "backdropClick" || reason === "escapeKeyDown") {
            onOpenChange?.(false)
          }
        }}
        {...props}
      >
        {children}
      </MuiDialog>
    </DialogContext.Provider>
  )
}

function DialogTrigger({
  children,
  onClick,
  ...props
}: React.ComponentPropsWithoutRef<"button">) {
  const { onOpenChange } = React.useContext(DialogContext)
  return (
    <Box
      component="button"
      type="button"
      data-slot="dialog-trigger"
      onClick={(e) => {
        onClick?.(e)
        onOpenChange?.(true)
      }}
      {...props}
    >
      {children}
    </Box>
  )
}

function DialogPortal({ children }: { children?: React.ReactNode }) {
  return <>{children}</>
}

function DialogOverlay(_props: React.ComponentPropsWithoutRef<"div">) {
  return null
}

function DialogClose({
  children,
  onClick,
  ...props
}: React.ComponentPropsWithoutRef<"button">) {
  const { onOpenChange } = React.useContext(DialogContext)
  return (
    <Box
      component="button"
      type="button"
      data-slot="dialog-close"
      onClick={(e) => {
        onClick?.(e)
        onOpenChange?.(false)
      }}
      {...props}
    >
      {children}
    </Box>
  )
}

export type DialogContentProps = React.ComponentProps<typeof MuiDialogContent> & {
  showCloseButton?: boolean
}

function DialogContent({
  className,
  children,
  showCloseButton = true,
  sx,
  ...props
}: DialogContentProps) {
  const { onOpenChange } = React.useContext(DialogContext)

  return (
    <MuiDialogContent
      data-slot="dialog-content"
      className={className}
      sx={[
        {
          position: "relative",
          borderRadius: 2,
          pt: showCloseButton ? 4 : 2,
        },
        ...(Array.isArray(sx) ? sx : sx ? [sx] : []),
      ]}
      {...props}
    >
      {showCloseButton && (
        <IconButton
          type="button"
          aria-label={i18n.t("common.close")}
          data-slot="dialog-close"
          onClick={() => onOpenChange?.(false)}
          sx={{
            position: "absolute",
            right: 8,
            top: 8,
            color: "text.secondary",
          }}
          size="small"
        >
          <CloseIcon fontSize="small" />
        </IconButton>
      )}
      {children}
    </MuiDialogContent>
  )
}

function DialogHeader({
  className,
  sx,
  ...props
}: React.ComponentProps<typeof Box> & { sx?: SxProps<Theme> }) {
  return (
    <Box
      data-slot="dialog-header"
      className={className}
      sx={sxMerge({ display: "flex", flexDirection: "column", gap: 1 }, sx)}
      {...props}
    />
  )
}

function DialogFooter({
  className,
  showCloseButton = false,
  children,
  sx,
  ...props
}: React.ComponentProps<typeof Box> & {
  showCloseButton?: boolean
  sx?: SxProps<Theme>
}) {
  const { onOpenChange } = React.useContext(DialogContext)

  return (
    <Box
      data-slot="dialog-footer"
      component="footer"
      className={className}
      sx={sxMerge(
        {
          display: "flex",
          flexDirection: { xs: "column-reverse", sm: "row" },
          gap: 1,
          justifyContent: "flex-end",
          alignItems: "stretch",
          borderTop: 1,
          borderColor: "divider",
          bgcolor: (t) => t.palette.action.hover,
          p: 2,
          mx: -3,
          mb: -3,
          borderRadius: "0 0 10px 10px",
        },
        sx,
      )}
      {...props}
    >
      {children}
      {showCloseButton && (
        <Button variant="outline" onClick={() => onOpenChange?.(false)} type="button">
          {i18n.t("common.close")}
        </Button>
      )}
    </Box>
  )
}

function DialogTitle({ className, sx, ...props }: React.ComponentProps<typeof MuiDialogTitle>) {
  return (
    <MuiDialogTitle
      data-slot="dialog-title"
      className={className}
      sx={sxMerge(
        {
          fontWeight: 600,
          fontSize: "1rem",
          lineHeight: 1.25,
          pr: DIALOG_TITLE_CLOSE_PADDING,
        },
        sx,
      )}
      {...props}
    />
  )
}

function DialogDescription({
  className,
  sx,
  ...props
}: React.ComponentProps<typeof Box>) {
  return (
    <Box
      data-slot="dialog-description"
      className={className}
      sx={sxMerge(
        {
          fontSize: "0.875rem",
          color: "text.secondary",
          "& a": { textDecoration: "underline", textUnderlineOffset: 3 },
        },
        sx,
      )}
      {...props}
    />
  )
}

export {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  DialogTrigger,
}
