import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * Label simples (sem dependência de @radix-ui/react-label) — mantém o app
 * leve para o target de cold start ≤ 3 s e evita superfície CSP adicional.
 */
const Label = React.forwardRef<
  HTMLLabelElement,
  React.LabelHTMLAttributes<HTMLLabelElement>
>(({ className, ...props }, ref) => (
  <label
    ref={ref}
    className={cn(
      "text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70",
      className,
    )}
    {...props}
  />
));
Label.displayName = "Label";

export { Label };
