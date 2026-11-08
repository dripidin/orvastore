import { ApiOrdersRepository } from "./api-orders-repository";
import type { IOrdersRepository, RepositoryMode } from "./types";

let apiInstance: ApiOrdersRepository | null = null;

export function getAppRepositoryMode(): RepositoryMode {
  return "live";
}

export function setAppRepositoryMode(_mode: RepositoryMode): void {
  // Always live mode in all environments
}

export function getOrdersRepository(): IOrdersRepository {
  if (!apiInstance) {
    apiInstance = new ApiOrdersRepository();
  }
  return apiInstance;
}
