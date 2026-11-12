// cn(...classes): joins class names (clsx) and lets a later Tailwind class win over an earlier one of the same kind
// (tailwind-merge), so a component's defaults can be overridden with className. Knows the studio's own type scale.
import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

const merge = extendTailwindMerge({
  extend: {
    theme: {
      text: ["2xs", "xs", "sm", "base", "md", "lg", "xl", "2xl"],
      radius: ["xs", "sm", "md", "lg", "xl"],
      shadow: ["pop", "sheet", "inset"],
    },
  },
});

export const cn = (...classes: ClassValue[]) => merge(clsx(classes));
