import { describe, test, expect } from "bun:test";
import { ADMIN_TOOLS, inputSchemaFor } from "../src/tools.js";

/**
 * Safety net against silent drift: every query parameter the admin spec
 * declares for a GET route must be accepted by that route's tool, and every
 * parameter the tool offers must exist on the route. Optional filters are
 * invisible to the coverage sweep (which calls each op with no params), so
 * without this test a missing filter ships unnoticed.
 */
describe("spec query params", () => {
  const spec = require("../spec/admin-swagger.json");
  const byPath = new Map<string, string[]>(
    Object.entries(spec.paths as Record<string, Record<string, any>>)
      .filter(([, methods]) => methods.get)
      .map(([path, methods]) => [
        path.replace("/admin", ""),
        (methods.get.parameters ?? [])
          .filter((p: any) => p.in === "query")
          .map((p: any) => p.name),
      ]),
  );
  const tools = new Map(ADMIN_TOOLS.map((t) => [t.path, t]));

  test("every spec query param is offered by its tool", () => {
    const missing: string[] = [];
    for (const [path, specParams] of byPath) {
      const tool = tools.get(path);
      if (!tool) continue; // route has no tool yet — other tests cover that
      const schema = inputSchemaFor(tool);
      for (const param of specParams) {
        if (!(param in schema)) missing.push(`${path} [${tool.name}]: ${param}`);
      }
    }
    if (missing.length) console.error("Missing query params:", missing);
    expect(missing).toEqual([]);
  });

  test("every offered query param exists on the route", () => {
    const extra: string[] = [];
    for (const [path, specParams] of byPath) {
      const tool = tools.get(path);
      if (!tool) continue;
      const schema = inputSchemaFor(tool);
      for (const key of Object.keys(schema)) {
        const isPath = /\{/.test(tool.path) && tool.path.includes(key);
        if (isPath || key === "seconds") continue;
        if (!specParams.includes(key)) extra.push(`${path} [${tool.name}]: ${key}`);
      }
    }
    if (extra.length) console.error("Unaccepted query params:", extra);
    expect(extra).toEqual([]);
  });

  test("audit filters carry session_id and exclude_operation through", () => {
    const log = ADMIN_TOOLS.find((t) => t.name === "get_audit_log")!;
    const schema = inputSchemaFor(log);
    expect(Object.keys(schema)).toContain("session_id");
    expect(Object.keys(schema)).toContain("exclude_operation");
  });
});
