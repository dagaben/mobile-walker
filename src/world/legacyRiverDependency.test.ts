import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/** Walk src/ and fail if any production module imports the quarantined legacy river. */
function collectTsFiles(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) {
      if (name === "node_modules") continue;
      collectTsFiles(path, out);
    } else if (name.endsWith(".ts") && !name.endsWith(".test.ts")) {
      out.push(path);
    }
  }
  return out;
}

describe("legacy river quarantine", () => {
  it("no production source imports src/world/river", () => {
    const root = join(process.cwd(), "src");
    const offenders: string[] = [];
    for (const file of collectTsFiles(root)) {
      if (file.endsWith(`${join("world", "river.ts")}`)) continue;
      const text = readFileSync(file, "utf8");
      if (/from\s+["']\.\.?\/.*river["']/.test(text) && !/worldRiver|riverSpine|riverProcedural/.test(text)) {
        // Allow comments mentioning river.ts
        const lines = text.split("\n").filter((line) => /from\s+["'][^"']*river["']/.test(line));
        for (const line of lines) {
          if (/worldRiver|riverSpineGeometry|riverProceduralFixtures/.test(line)) continue;
          if (/\/river["']/.test(line) || /["']\.\/river["']/.test(line) || /["']\.\.\/world\/river["']/.test(line)) {
            offenders.push(`${file}: ${line.trim()}`);
          }
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});
