import type { ReactElement } from "react";
import { PayoutConsole } from "@/components/PayoutConsole";

/**
 * Renders the ShadeOps payout operator console page.
 */
export default async function PayoutPage(): Promise<ReactElement> {
  return <PayoutConsole />;
}
