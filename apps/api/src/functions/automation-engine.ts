import { app, InvocationContext, Timer } from "@azure/functions";
import { runTimerAutomations } from "../services/automation.js";

export async function automationEngine(timer: Timer, context: InvocationContext): Promise<void> {
  context.log("Automation engine timer triggered", timer.scheduleStatus);
  await runTimerAutomations();
}

app.timer("automationEngine", {
  schedule: "0 */5 * * * *",
  handler: automationEngine,
});
