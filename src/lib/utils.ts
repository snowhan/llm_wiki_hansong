/** Joins truthy class name parts (replaces removed `clsx` + `tailwind-merge`). */
export function cn(...inputs: (string | undefined | null | false)[]) {
  return inputs.filter(Boolean).join(" ")
}
