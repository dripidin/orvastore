import { ApiOrdersRepository } from "./api-orders-repository";
import { MockOrdersRepository } from "./mock-orders-repository";
import { isDemoModeAllowed } from "@/lib/demo-environment";
import type { IOrdersRepository, RepositoryMode } from "./types";

let apiInstance: ApiOrdersRepository | null = null;
let mockInstance: MockOrdersRepository | null = null;

function isDemoSessionActive(): boolean {
  if (typeof window === "undefined") return false;
  if (!isDemoModeAllowed()) return false;
  try {
    return window.localStorage.getItem("orva_demo_session_active") === "true";
  } catch {
    return false;
  }
}

export function getAppRepositoryMode(): RepositoryMode {
  return isDemoSessionActive() ? "mock" : "live";
}

export function setAppRepositoryMode(_mode: RepositoryMode): void {
  // Controlled via AdminSessionGate demo session toggle on allowed hosts
}

export function getOrdersRepository(): IOrdersRepository {
  if (isDemoSessionActive()) {
    if (!mockInstance) {
      mockInstance = new MockOrdersRepository();
    }
    return mockInstance;
  }
  if (!apiInstance) {
    apiInstance = new ApiOrdersRepository();
  }
  return apiInstance;
}
