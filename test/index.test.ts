import { describe, expect, it } from "vitest";
import { defineLandingPage } from "../src/index.js";

const metadata = { title: "Home", description: "Home page" };

describe("defineLandingPage", () => {
  it("accepts an entry route and a body route", () => {
    const config = defineLandingPage({
      routes: [
        { path: "/", entry: "src/main.ts", metadata },
        {
          path: "/composed/",
          body: "<main>Composed</main>",
          stylesheet: "main { color: rebeccapurple; }",
          metadata,
        },
      ],
    });
    expect(config.routes).toHaveLength(2);
  });

  it("rejects a configuration without routes", () => {
    expect(() => defineLandingPage({ routes: [] })).toThrow(
      "at least one route",
    );
  });

  it("rejects a route that declares neither an entry nor a body", () => {
    expect(() =>
      defineLandingPage({
        routes: [{ path: "/", metadata } as never],
      }),
    ).toThrow("exactly one of 'entry' and 'body'");
  });

  it("rejects a route that declares both an entry and a body", () => {
    expect(() =>
      defineLandingPage({
        routes: [
          { path: "/", entry: "src/main.ts", body: "<p>both</p>", metadata },
        ],
      }),
    ).toThrow("exactly one of 'entry' and 'body'");
  });

  it("rejects a stylesheet that would close the style element", () => {
    expect(() =>
      defineLandingPage({
        routes: [
          {
            path: "/",
            body: "<p>page</p>",
            stylesheet: "a {}</STYLE>",
            metadata,
          },
        ],
      }),
    ).toThrow("containing '</style'");
  });

  it("rejects a stylesheet declared on an entry route", () => {
    expect(() =>
      defineLandingPage({
        routes: [
          { path: "/", entry: "src/main.ts", stylesheet: "a {}" } as never,
        ],
      }),
    ).toThrow("belongs to a body route");
  });
});
