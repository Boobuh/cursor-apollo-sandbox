import * as vscode from "vscode";
import {
  createDefaultDeps,
  registerApolloSandboxCommands
} from "./extension.commands";
import { maybeRunE2EOnActivation } from "./e2e/run-on-activation";
import type { ExtensionHostApi } from "./extension.types";
import { deriveGraphqlUrlMatch } from "./apollo/sandbox";
import type { ResolvedSandboxConfig, SandboxConfig } from "./apollo/sandbox.types";

const LOG_PREFIX = "[Cursor Apollo Sandbox]";

function asExtensionHostApi(): ExtensionHostApi {
  return {
    commands: vscode.commands,
    window: vscode.window,
    workspace: vscode.workspace,
    ProgressLocation: vscode.ProgressLocation
  };
}

function logActivationError(scope: string, err: unknown): void {
  const message = err instanceof Error ? err.message : String(err);
  console.error(`${LOG_PREFIX} ${scope}: ${message}`);
}

/** Activation must never throw — an uncaught error here can destabilize Cursor on startup. */
export function activate(context: vscode.ExtensionContext): void {
  try {
    registerApolloSandboxCommands(context, createDefaultDeps(asExtensionHostApi()));
  } catch (err) {
    logActivationError("command registration failed", err);
    return;
  }

  if (process.env.APOLLO_E2E === "1") {
    void maybeRunE2EOnActivation(asExtensionHostApi(), context.extensionPath).catch(
      (err) => logActivationError("E2E on activation failed", err)
    );
  }
}

export function deactivate(): void {}

export type { ResolvedSandboxConfig, SandboxConfig };
export { deriveGraphqlUrlMatch };
export {
  APOLLO_COMMAND_IDS,
  registerApolloSandboxCommands,
  createDefaultDeps
} from "./extension.commands";
export {
  getBaseConfig,
  getResolvedConfig,
  autoDetectHeaders,
  fillSandbox,
  runOperation,
  runApolloCommand
} from "./extension.service";
