import { runNightlyPartWatch } from "./nightly.ts";

const result = await runNightlyPartWatch();
console.log(
  `part-watch complete; new alerts=${result.newAlerts} watches=${result.watches}`,
);
