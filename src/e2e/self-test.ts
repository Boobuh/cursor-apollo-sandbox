export interface SelfTestResult {
  name: string;
  ok: boolean;
  skipped?: boolean;
  error?: string;
}

export interface SelfTestCommands {
  executeCommand: (command: string, ...args: unknown[]) => Thenable<unknown>;
  getCommands?: (filterInternal?: boolean) => Thenable<string[]>;
}

const GRAPHQL =
  process.env.APOLLO_E2E_GRAPHQL_URL ?? "http://localhost:3001/graphql";

async function hasCursorBrowserApi(
  commands: SelfTestCommands
): Promise<boolean> {
  if (commands.getCommands) {
    const list = await commands.getCommands(true);
    return list.some((id) => id.startsWith("cursor.browserView."));
  }
  try {
    await commands.executeCommand("cursor.browserView.listTabs");
    return true;
  } catch {
    return false;
  }
}

async function listCommands(commands: SelfTestCommands): Promise<string[]> {
  if (commands.getCommands) {
    return commands.getCommands(true);
  }
  return [];
}

async function runCase(
  name: string,
  fn: () => Promise<void>,
  skipIf?: () => Promise<boolean>
): Promise<SelfTestResult> {
  try {
    if (skipIf && (await skipIf())) {
      return { name, ok: true, skipped: true };
    }
    await fn();
    return { name, ok: true };
  } catch (err) {
    return {
      name,
      ok: false,
      error: err instanceof Error ? err.message : String(err)
    };
  }
}

/** Real Cursor browser API checks — runs inside the extension host. */
export async function runCursorBrowserSelfTests(
  commands: SelfTestCommands
): Promise<SelfTestResult[]> {
  const results: SelfTestResult[] = [];
  const skipWithoutBrowser = async () =>
    !(await hasCursorBrowserApi(commands));

  results.push(
    await runCase("cursor.browserView.listTabs", async () => {
      const result = (await commands.executeCommand(
        "cursor.browserView.listTabs"
      )) as { tabs?: unknown[] } | undefined;
      if (!result || !Array.isArray(result.tabs)) {
        throw new Error("listTabs did not return tabs array");
      }
    }, skipWithoutBrowser)
  );

  results.push(
    await runCase(
      "executeJavaScript without viewId",
      async () => {
        const viewId = (await commands.executeCommand(
          "cursor.browserView.newTab",
          "about:blank"
        )) as string | undefined;
        if (!viewId) throw new Error("newTab returned no viewId");

        await commands.executeCommand("cursor.browserView.selectTab", viewId);
        await new Promise((r) => setTimeout(r, 800));

        const title = (await commands.executeCommand(
          "cursor.browserView.executeJavaScript",
          "document.title"
        )) as string | undefined;
        if (typeof title !== "string") {
          throw new Error("executeJavaScript did not return string");
        }
      },
      skipWithoutBrowser
    )
  );

  results.push(
    await runCase(
      "navigate active view without viewId",
      async () => {
        const target =
          "data:text/html,<html><title>apollo-self-test</title></html>";
        await commands.executeCommand("cursor.browserView.navigate", target);
        await new Promise((r) => setTimeout(r, 1000));
        const title = (await commands.executeCommand(
          "cursor.browserView.executeJavaScript",
          "document.title"
        )) as string;
        if (title !== "apollo-self-test") {
          throw new Error(`expected apollo-self-test title, got ${title}`);
        }
      },
      skipWithoutBrowser
    )
  );

  results.push(
    await runCase("apolloSandbox commands registered", async () => {
      const commandList = await listCommands(commands);
      for (const id of [
        "apolloSandbox.openGraphql",
        "apolloSandbox.captureAuth",
        "apolloSandbox.runOperation"
      ]) {
        if (!commandList.includes(id)) {
          throw new Error(`missing command ${id}`);
        }
      }
    })
  );

  results.push(
    await runCase(
      "apolloSandbox.openGraphql opens graphql host tab",
      async () => {
        await commands.executeCommand("apolloSandbox.openGraphql");
        await new Promise((r) => setTimeout(r, 3000));
        const ctx = (await commands.executeCommand(
          "cursor.browserView.listTabs"
        )) as { tabs?: Array<{ url?: string }> } | undefined;
        const urls = (ctx?.tabs ?? []).map((t) => t.url).filter(Boolean);
        const host = new URL(GRAPHQL).host;
        if (!urls.some((u) => u?.includes(host))) {
          throw new Error(
            `no tab for ${host}; open tabs: ${urls.join(", ") || "(none)"}`
          );
        }
      },
      skipWithoutBrowser
    )
  );

  return results;
}

export function summarizeSelfTestResults(
  results: SelfTestResult[]
): { passed: number; failed: number; skipped: number } {
  return {
    passed: results.filter((r) => r.ok && !r.skipped).length,
    failed: results.filter((r) => !r.ok).length,
    skipped: results.filter((r) => r.skipped).length
  };
}
