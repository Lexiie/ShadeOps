import type { ReactElement } from "react";
import { cn } from "@/lib/utils";

type ShadeOpsLogoProps = {
  className?: string;
  hideWordmarkOnSmall?: boolean;
};

/**
 * Renders the ShadeOps header logo as one raster wordmark asset.
 */
export function ShadeOpsLogo({ className, hideWordmarkOnSmall = false }: Readonly<ShadeOpsLogoProps>): ReactElement {
  return (
    <span className={cn("inline-flex min-w-0 items-center", className)}>
      <img
        src="/shadeops-logo.png"
        alt="ShadeOps"
        width={640}
        height={180}
        className={cn("h-10 w-auto shrink-0 object-contain", hideWordmarkOnSmall && "max-[359px]:h-8")}
      />
    </span>
  );
}
