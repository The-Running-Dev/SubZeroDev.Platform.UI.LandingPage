import { describe, expect, it } from "vitest";
import { defineLandingPage, validateLandingPageData } from "../src/index.js";

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

  it("accepts nested and dotted route path segments", () => {
    expect(
      defineLandingPage({
        routes: [
          { path: "/", entry: "src/main.ts", metadata },
          { path: "/docs/v1.2/", entry: "src/docs.ts", metadata },
          { path: "/.well-known/", entry: "src/known.ts", metadata },
        ],
      }).routes,
    ).toHaveLength(3);
  });

  it("rejects a route path that would traverse out of the entry directory", () => {
    for (const path of ["/../", "/a/../../", "/./", "/a%2f..%2f/", "/a//"])
      expect(() =>
        defineLandingPage({
          routes: [{ path: path as "/", entry: "src/main.ts", metadata }],
        }),
      ).toThrow("invalid segment");
  });

  it("rejects a route path that is not a directory path", () => {
    expect(() =>
      defineLandingPage({
        routes: [{ path: "/about" as "/", entry: "src/main.ts", metadata }],
      }),
    ).toThrow("must start and end with '/'");
  });

  it("rejects two routes that would generate one document", () => {
    expect(() =>
      defineLandingPage({
        routes: [
          { path: "/legal/", body: "<main>a</main>", metadata },
          { path: "/legal/", body: "<main>b</main>", metadata },
        ],
      }),
    ).toThrow("Duplicate route path '/legal/'");
  });
});

describe("LandingPageData", () => {
  it("accepts the versioned generic model", () => {
    expect(
      validateLandingPageData({
        version: 1,
        kind: "generic",
        home: { markdown: "# Home\n\nDescription." },
        changelog: { markdown: "# Changelog\n\n- First" },
        themeCss: "body { color: rebeccapurple; }",
      }),
    ).toMatchObject({ kind: "generic", version: 1 });
  });

  it("rejects unknown fields and runtime data on a body route", () => {
    expect(() =>
      validateLandingPageData({
        version: 1,
        kind: "generic",
        home: { markdown: "# Home\n\nDescription." },
        changelog: { markdown: "# Changelog\n\n- First" },
        unexpected: true,
      }),
    ).toThrow("unknown field");
    expect(() =>
      validateLandingPageData({
        version: 1,
        kind: "adapter",
        routes: [
          {
            path: "/",
            body: "<main>Home</main>",
            dataSourceIds: ["runtime"],
            metadata,
          },
        ],
      }),
    ).toThrow("body route");
  });

  it("rejects a model route path that would traverse out of the entry directory", () => {
    expect(() =>
      validateLandingPageData({
        version: 1,
        kind: "adapter",
        routes: [{ path: "/../", body: "<h1>escaped</h1>", metadata }],
      }),
    ).toThrow("invalid segment");
  });

  it("rejects a model that declares one route path twice", () => {
    expect(() =>
      validateLandingPageData({
        version: 1,
        kind: "adapter",
        routes: [
          { path: "/", body: "<main>a</main>", metadata },
          { path: "/", body: "<main>b</main>", metadata },
        ],
      }),
    ).toThrow("Duplicate route path '/'");
  });

  it.each([
    [
      "an unsupported version",
      {
        version: 2,
        kind: "generic",
        home: { markdown: "# Home" },
        changelog: { markdown: "# Changes" },
      },
      "version must be 1",
    ],
    [
      "an unknown kind",
      {
        version: 1,
        kind: "unknown",
        home: { markdown: "# Home" },
        changelog: { markdown: "# Changes" },
      },
      "kind must be 'generic' or 'adapter'",
    ],
    [
      "malformed markdown",
      {
        version: 1,
        kind: "generic",
        home: { markdown: 1 },
        changelog: { markdown: "# Changes" },
      },
      "generic.home.markdown must be a string",
    ],
    [
      "malformed metadata",
      {
        version: 1,
        kind: "adapter",
        routes: [
          { path: "/", body: "<main>Home</main>", metadata: { title: "Home" } },
        ],
      },
      "requires string title and description",
    ],
    [
      "an invalid icon relation",
      {
        version: 1,
        kind: "adapter",
        routes: [
          {
            path: "/",
            body: "<main>Home</main>",
            metadata: {
              ...metadata,
              icons: [{ rel: "shortcut", href: "/favicon.ico" }],
            },
          },
        ],
      },
      "icons[0].rel is invalid",
    ],
    [
      "a non-numeric Open Graph dimension",
      {
        version: 1,
        kind: "adapter",
        routes: [
          {
            path: "/",
            body: "<main>Home</main>",
            metadata: {
              ...metadata,
              openGraph: {
                title: "Home",
                description: "Home page",
                type: "website",
                url: "https://example.test/",
                imageWidth: "wide",
              },
            },
          },
        ],
      },
      "openGraph.imageWidth must be a number",
    ],
  ])("rejects %s", (_label, value, message) => {
    expect(() => validateLandingPageData(value)).toThrow(message);
  });
});
