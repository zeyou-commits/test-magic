import { createContext, useContext } from "react";
import type { TravelAction } from "@/lib/notifications/actions";

export const TravelActionContext = createContext<(action: TravelAction) => void>(() => {});
export function useTravelAction() {
  return useContext(TravelActionContext);
}
