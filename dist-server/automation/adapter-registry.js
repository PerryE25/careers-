import { GreenhouseAdapter } from "./adapters/greenhouse-adapter.js";
import { LeverAdapter } from "./adapters/lever-adapter.js";
import { WorkdayAdapter } from "./adapters/workday-adapter.js";
export class AdapterRegistry {
    adapters = [
        new LeverAdapter(),
        new GreenhouseAdapter(),
        new WorkdayAdapter(),
    ];
    resolve(url, html) {
        return this.adapters.find((adapter) => adapter.canHandle(url, html));
    }
}
