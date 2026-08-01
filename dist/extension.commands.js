"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.APOLLO_COMMAND_IDS = void 0;
exports.registerApolloSandboxCommands = registerApolloSandboxCommands;
exports.createDefaultDeps = createDefaultDeps;
const run_on_activation_1 = require("./e2e/run-on-activation");
const browser_1 = require("./browser");
const browser_types_1 = require("./browser.types");
const browser_utils_1 = require("./browser.utils");
const extension_helpers_1 = require("./extension.helpers");
const extension_service_1 = require("./extension.service");
exports.APOLLO_COMMAND_IDS = [
    "apolloSandbox.openGraphql",
    "apolloSandbox.captureAuth",
    "apolloSandbox.fillSandbox",
    "apolloSandbox.runOperation",
    "apolloSandbox.setupSandbox",
    "apolloSandbox.runExport",
    "apolloSandbox.setupExportTemplate",
    "apolloSandbox.runSelfTest"
];
function formatCommandError(err) {
    return err instanceof Error ? err.message : String(err);
}
function showCommandError(api, err) {
    if ((0, browser_utils_1.isBrowserViewError)(err)) {
        void api.window.showErrorMessage(`Apollo Sandbox: Cursor browser tab issue. ${browser_types_1.BROWSER_TAB_HELP}`);
        return;
    }
    void api.window.showErrorMessage(`Apollo Sandbox: ${formatCommandError(err)}`);
}
/** Wrap command handlers so uncaught errors never escape the extension host. */
function safeCommand(api, fn) {
    return async () => {
        try {
            await fn();
        }
        catch (err) {
            showCommandError(api, err);
        }
    };
}
/** Register all Apollo Sandbox commands (testable with mocked host + browser). */
function registerApolloSandboxCommands(context, deps) {
    const { api, browser } = deps;
    context.subscriptions.push(api.commands.registerCommand("apolloSandbox.openGraphql", safeCommand(api, async () => {
        const config = await (0, extension_service_1.getResolvedConfig)(api, browser);
        await browser.ensureBrowserTab(config.graphqlUrl);
        api.window.showInformationMessage(`Opened ${config.graphqlUrl}${(0, extension_helpers_1.endpointHint)(config)}`);
    })), api.commands.registerCommand("apolloSandbox.captureAuth", safeCommand(api, async () => {
        await (0, extension_service_1.runApolloCommand)(api, "Apollo Sandbox: auto-detecting headers…", async () => {
            const config = await (0, extension_service_1.getResolvedConfig)(api, browser);
            const auth = await (0, extension_service_1.autoDetectHeaders)(browser, config);
            api.window.showInformationMessage((0, extension_helpers_1.headerSummary)(auth) + (0, extension_helpers_1.endpointHint)(config));
        });
    })), api.commands.registerCommand("apolloSandbox.fillSandbox", safeCommand(api, async () => {
        await (0, extension_service_1.runApolloCommand)(api, "Apollo Sandbox: detecting headers and filling…", async () => {
            const config = await (0, extension_service_1.getResolvedConfig)(api, browser);
            const auth = await (0, extension_service_1.autoDetectHeaders)(browser, config);
            await (0, extension_service_1.fillSandbox)(browser, config, auth);
            api.window.showInformationMessage(`Sandbox filled. ${(0, extension_helpers_1.headerSummary)(auth)}${(0, extension_helpers_1.endpointHint)(config)}`);
        });
    })), api.commands.registerCommand("apolloSandbox.runOperation", safeCommand(api, async () => {
        await (0, extension_service_1.runApolloCommand)(api, "Apollo Sandbox: detecting headers and running…", async () => {
            const config = await (0, extension_service_1.getResolvedConfig)(api, browser);
            await (0, extension_service_1.autoDetectHeaders)(browser, config);
            const { data, ms } = await (0, extension_service_1.runOperation)(browser, config);
            const preview = data
                ? JSON.stringify(data).slice(0, 120)
                : "see Response panel";
            api.window.showInformationMessage(`OK (${ms}ms): ${preview}${(0, extension_helpers_1.endpointHint)(config)}`);
        });
    })), api.commands.registerCommand("apolloSandbox.setupSandbox", safeCommand(api, async () => {
        await (0, extension_service_1.runApolloCommand)(api, "Apollo Sandbox: auto-detect, fill…", async () => {
            const config = await (0, extension_service_1.getResolvedConfig)(api, browser);
            const auth = await (0, extension_service_1.autoDetectHeaders)(browser, config);
            await (0, extension_service_1.fillSandbox)(browser, config, auth);
            api.window.showInformationMessage(`Apollo Sandbox ready. ${(0, extension_helpers_1.headerSummary)(auth)}${(0, extension_helpers_1.endpointHint)(config)}`);
        });
    })), api.commands.registerCommand("apolloSandbox.runExport", safeCommand(api, async () => {
        await api.commands.executeCommand("apolloSandbox.runOperation");
    })), api.commands.registerCommand("apolloSandbox.setupExportTemplate", safeCommand(api, async () => {
        await api.commands.executeCommand("apolloSandbox.setupSandbox");
    })), api.commands.registerCommand("apolloSandbox.runSelfTest", safeCommand(api, async () => {
        await (0, run_on_activation_1.runSelfTestCommand)(api);
    })));
}
/** Build deps from real VS Code API (used by activate). */
function createDefaultDeps(api) {
    return {
        api,
        browser: new browser_1.CursorBrowser(api.commands)
    };
}
//# sourceMappingURL=extension.commands.js.map