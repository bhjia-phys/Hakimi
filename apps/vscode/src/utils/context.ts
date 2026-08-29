import * as vscode from "vscode";
import type { KimiHarness } from "@bhjia-phys/hakimi-sdk";

export async function updateLoginContext(harness: KimiHarness): Promise<boolean> {
  const status = await harness.auth.status();
  const loggedIn = status.providers.some((provider) => provider.hasToken);
  await vscode.commands.executeCommand("setContext", "kimi.isLoggedIn", loggedIn);
  return loggedIn;
}
