import { describe, expect, it } from "vitest";
import { parseCsv } from "./csv";

describe("parseCsv", () => {
  it("parses a basic CSV into header + row objects", async () => {
    const result = await parseCsv("first_name,last_name,email\nJane,Doe,jane@example.com\n");
    expect(result.headers).toEqual(["first_name", "last_name", "email"]);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]).toEqual({
      rowNumber: 1,
      values: { first_name: "Jane", last_name: "Doe", email: "jane@example.com" },
    });
  });

  it("handles quoted fields containing commas", async () => {
    const result = await parseCsv('name,title\n"Doe, Jane","VP, Sales"\n');
    expect(result.rows[0]?.values).toEqual({ name: "Doe, Jane", title: "VP, Sales" });
  });

  it("handles quoted fields containing embedded newlines", async () => {
    const result = await parseCsv('name,notes\nJane,"Line one\nLine two"\n');
    expect(result.rows[0]?.values.notes).toBe("Line one\nLine two");
  });

  it("handles unicode content", async () => {
    const result = await parseCsv("name,city\nJosé García,São Paulo\n");
    expect(result.rows[0]?.values).toEqual({ name: "José García", city: "São Paulo" });
  });

  it("strips a UTF-8 BOM from the first header", async () => {
    const withBom = Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from("name\nJane\n")]);
    const result = await parseCsv(withBom);
    expect(result.headers).toEqual(["name"]);
  });

  it("skips blank lines", async () => {
    const result = await parseCsv("name,email\nJane,jane@example.com\n\n\nJohn,john@example.com\n");
    expect(result.rows).toHaveLength(2);
    expect(result.rows.map((r) => r.rowNumber)).toEqual([1, 2]);
  });

  it("tolerates rows with fewer columns than the header (relaxed column count)", async () => {
    const result = await parseCsv("first_name,last_name,email\nJane\n");
    expect(result.rows[0]?.values).toEqual({ first_name: "Jane", last_name: "", email: "" });
  });

  it("parses a large file efficiently and preserves row order", async () => {
    const lines = ["first_name,email"];
    for (let i = 0; i < 5000; i += 1) {
      lines.push(`Person${i},person${i}@example.com`);
    }
    const result = await parseCsv(lines.join("\n"));
    expect(result.rows).toHaveLength(5000);
    expect(result.rows[0]?.values.first_name).toBe("Person0");
    expect(result.rows[4999]?.values.first_name).toBe("Person4999");
  });

  it("rejects malformed CSV with a CsvParseError", async () => {
    await expect(parseCsv('name,email\n"unterminated quote,jane@example.com\n')).rejects.toThrow();
  });
});
