"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.runApolloCommand = exports.runOperation = exports.fillSandbox = exports.autoDetectHeaders = exports.getResolvedConfig = exports.getBaseConfig = exports.createDefaultDeps = exports.registerApolloSandboxCommands = exports.APOLLO_COMMAND_IDS = exports.deriveGraphqlUrlMatch = void 0;
exports.activate = activate;
exports.deactivate = deactivate;
const vscode = __importStar(require("vscode"));
const extension_commands_1 = require("./extension.commands");
const sandbox_1 = require("./apollo/sandbox");
Object.defineProperty(exports, "deriveGraphqlUrlMatch", { enumerable: true, get: function () { return sandbox_1.deriveGraphqlUrlMatch; } });
function asExtensionHostApi() {
    return {
        commands: vscode.commands,
        window: vscode.window,
        workspace: vscode.workspace,
        ProgressLocation: vscode.ProgressLocation
    };
}
function activate(context) {
    (0, extension_commands_1.registerApolloSandboxCommands)(context, (0, extension_commands_1.createDefaultDeps)(asExtensionHostApi()));
}
function deactivate() { }
var extension_commands_2 = require("./extension.commands");
Object.defineProperty(exports, "APOLLO_COMMAND_IDS", { enumerable: true, get: function () { return extension_commands_2.APOLLO_COMMAND_IDS; } });
Object.defineProperty(exports, "registerApolloSandboxCommands", { enumerable: true, get: function () { return extension_commands_2.registerApolloSandboxCommands; } });
Object.defineProperty(exports, "createDefaultDeps", { enumerable: true, get: function () { return extension_commands_2.createDefaultDeps; } });
var extension_service_1 = require("./extension.service");
Object.defineProperty(exports, "getBaseConfig", { enumerable: true, get: function () { return extension_service_1.getBaseConfig; } });
Object.defineProperty(exports, "getResolvedConfig", { enumerable: true, get: function () { return extension_service_1.getResolvedConfig; } });
Object.defineProperty(exports, "autoDetectHeaders", { enumerable: true, get: function () { return extension_service_1.autoDetectHeaders; } });
Object.defineProperty(exports, "fillSandbox", { enumerable: true, get: function () { return extension_service_1.fillSandbox; } });
Object.defineProperty(exports, "runOperation", { enumerable: true, get: function () { return extension_service_1.runOperation; } });
Object.defineProperty(exports, "runApolloCommand", { enumerable: true, get: function () { return extension_service_1.runApolloCommand; } });
//# sourceMappingURL=extension.js.map