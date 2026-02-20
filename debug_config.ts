
import { getModel } from "./apps/api/src/lib/generic-ai";

console.log("Checking config...");
try {
    getModel("test-model");
} catch (e) {
    // Ignore errors, we just want the side-effect logs
}
