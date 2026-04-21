import type { AtsAdapter } from "./adapter.js";
import { GreenhouseAdapter } from "./adapters/greenhouse-adapter.js";
import { LeverAdapter } from "./adapters/lever-adapter.js";
import { WorkdayAdapter } from "./adapters/workday-adapter.js";

export class AdapterRegistry {
  private readonly adapters: AtsAdapter[] = [
    new LeverAdapter(),
    new GreenhouseAdapter(),
    new WorkdayAdapter(),
  ];

  resolve(url: string, html?: string) {
    return this.adapters.find((adapter) => adapter.canHandle(url, html));
  }
}
