import { afterEach, describe, expect, it } from "vitest";
import {
  createFakePluginHost,
  makeThreadResponse,
  experimental_scanPublicSdkOnly,
} from "@get-bb/plugin-sdk/testing";
import plugin from "../server";

const hosts: ReturnType<typeof createFakePluginHost>[] = [];
afterEach(async () => {
  for (const host of hosts.splice(0)) await host.harness.lifecycle.dispose();
});

async function setup() {
  let host = createFakePluginHost();
  hosts.push(host);
  await plugin(host.bb);
  const call = async (method: string, input: unknown) => {
    try {
      return {
        ok: true,
        result: await host.harness.behavior.callRpc(method, input),
      };
    } catch (error) {
      return { ok: false, error };
    }
  };
  return {
    get harness() {
      return host.harness;
    },
    get bb() {
      return host.bb;
    },
    call,
    reload: async () => {
      host = await host.harness.lifecycle.reload(plugin);
      hosts.push(host);
    },
  };
}

const input = (invocationId = "a", threadId = "t") => ({
  threadId,
  invocationId,
  message: { id: "m", threadId, role: "assistant", sourceSeqEnd: 3 },
  selectedText: " exact\nquote ",
  feedback: { body: "Explain this" },
});

const result = (response: any) => {
  expect(response).toMatchObject({ ok: true });
  return response.result;
};

describe("draft RPC", () => {
  it("persists, isolates, edits, removes and reloads; quotes keep creation order", async () => {
    const h = await setup();
    expect(result(await h.call("getDraft", { threadId: "t" })).items).toEqual(
      [],
    );
    await Promise.all([
      h.call("addItem", input()),
      h.call("addItem", input("b")),
    ]);
    expect(
      result(await h.call("getDraft", { threadId: "other" })).items,
    ).toEqual([]);
    // Reordering is gone: quotes render in creation order only.
    expect(
      await h.call("moveItem", { threadId: "t", itemId: "b", direction: "up" }),
    ).toMatchObject({ ok: false });
    let draft = result(
      await h.call("updateItem", {
        threadId: "t",
        itemId: "b",
        patch: { body: "Updated comment" },
      }),
    );
    expect(draft.items.map((item: any) => item.id)).toEqual(["a", "b"]);
    expect(draft.items[1].body).toBe("Updated comment");
    expect(draft.items[1]).not.toHaveProperty("kind");
    await h.reload();
    expect(result(await h.call("getDraft", { threadId: "t" }))).toEqual(draft);
    expect(
      result(await h.call("removeItem", { threadId: "t", itemId: "a" })).items,
    ).toHaveLength(1);
    expect(
      await h.call("removeItem", { threadId: "t", itemId: "missing" }),
    ).toMatchObject({ ok: false });
    await h.harness.behavior.emitThreadEvent("thread.deleted", {
      thread: makeThreadResponse({ id: "t" }),
    });
    expect(result(await h.call("getDraft", { threadId: "t" })).items).toEqual(
      [],
    );
  });

  it("migrates legacy drafts: drops kind and overallFeedback, keeps removal reasons as comments, drops body-less removals", async () => {
    const h = await setup();
    const createdAt = new Date(0).toISOString();
    await h.bb.storage.kv.set("draft:t", {
      threadId: "t",
      overallFeedback: "",
      updatedAt: createdAt,
      items: [
        { id: "c1", messageId: "m", sourceSeqEnd: 1, quote: "quoted one", kind: "comment", body: "Keep this", createdAt },
        { id: "r1", messageId: "m", sourceSeqEnd: 2, quote: "quoted two", kind: "remove", body: "Redundant", createdAt },
        { id: "r2", messageId: "m", sourceSeqEnd: 3, quote: "quoted three", kind: "remove", body: "", createdAt },
      ],
    });
    const draft = result(await h.call("getDraft", { threadId: "t" }));
    expect(draft.items.map((item: any) => item.id)).toEqual(["c1", "r1"]);
    expect(draft.items[1].body).toBe("Redundant");
    for (const item of draft.items)
      expect(item).not.toHaveProperty("kind");
    expect(draft).not.toHaveProperty("overallFeedback");
  });

  it("validates role, thread, comment, whitespace and size; deduplicates invocation", async () => {
    const h = await setup();
    for (const invalid of [
      { ...input(), selectedText: "  " },
      { ...input(), selectedText: "x".repeat(20001) },
      { ...input(), feedback: { body: " " } },
      { ...input(), feedback: { kind: "comment", body: "x" } },
      { ...input(), message: { ...input().message, role: "user" } },
      { ...input(), threadId: "other" },
    ])
      expect(await h.call("addItem", invalid)).toMatchObject({ ok: false });
    result(await h.call("addItem", input()));
    expect(result(await h.call("addItem", input())).items).toHaveLength(1);
    expect(
      await h.call("setOverallFeedback", { threadId: "t", value: "x" }),
    ).toMatchObject({ ok: false });
    expect(await h.call("sendDraft", { threadId: "t" })).toMatchObject({
      ok: false,
    });
    for (let index = 0; index < 12; index++)
      await h.call("addItem", {
        ...input(`big${index}`),
        selectedText: "😀".repeat(9500),
      });
    const draft = result(await h.call("getDraft", { threadId: "t" }));
    expect(Buffer.byteLength(JSON.stringify(draft))).toBeLessThanOrEqual(220000);
    expect(draft.items.length).toBeLessThan(13);
  });

  it("public SDK scan", () => {
    const scan = experimental_scanPublicSdkOnly(process.cwd(), {
      allow: [
        /^react(?:-dom)?(?:\/|$)/,
        /^sonner$/,
        /^@testing-library\//,
        /^vitest(?:\/|$)/,
        /^@\//,
        /^@radix-ui\//,
        /^(class-variance-authority|clsx|tailwind-merge|vaul)$/,
      ],
    });
    expect(scan.violations).toEqual([]);
    expect(scan.privateDependencies).toEqual([]);
  });
});
