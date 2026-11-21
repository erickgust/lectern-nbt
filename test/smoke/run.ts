import { scenario } from "./scenario.js";

const failures = await scenario();
if (failures.length > 0) throw new Error(`smoke test failed: ${failures.join(", ")}`);
console.log("smoke test passed");
