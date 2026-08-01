import * as vscode from "vscode";
import {
  createDefaultDeps,
  registerApolloSandboxCommands
} from "./extension.commands";
import type { ExtensionHostApi } from "./extension.types";
import { deriveGraphqlUrlMatch } from "./apollo/sandbox";
import type { ResolvedSandboxConfig, SandboxConfig } from "./apollo/sandbox.types";

function asExtensionHostApi(): ExtensionHostApi {
  return {
    commands: vscode.commands,
    window: vscode.window,
    workspace: vscode.workspace,
    ProgressLocation: vscode.ProgressLocation
  };
}

export function activate(context: vscode.ExtensionContext): void {
  registerApolloSandboxCommands(context, createDefaultDeps(asExtensionHostApi()));
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
