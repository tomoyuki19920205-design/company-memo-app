import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import TopNavigation from "../components/TopNavigation";

const expectedLinks = [
  { label: "COMPANY VIEWER", href: "/tdnet-alerts" },
  { label: "SCREENING", href: "/screening" },
  { label: "NEWS", href: "/news" },
] as const;

test("renders the three shared navigation links in the original order", () => {
  const markup = renderToStaticMarkup(<TopNavigation active="company" />);
  let previousIndex = -1;

  for (const link of expectedLinks) {
    const index = markup.indexOf(`href="${link.href}"`);
    assert.ok(index > previousIndex, `${link.label} should follow the previous link`);
    assert.match(markup, new RegExp(`href="${link.href}"[^>]*>${link.label}</a>`));
    previousIndex = index;
  }
});

for (const active of ["company", "screening", "news"] as const) {
  test(`marks only ${active} as the active page`, () => {
    const markup = renderToStaticMarkup(<TopNavigation active={active} />);
    assert.equal((markup.match(/aria-current="page"/g) ?? []).length, 1);
    assert.equal((markup.match(/class="site-link active"/g) ?? []).length, 1);
    const activeLink = expectedLinks.find((link) =>
      active === "company" ? link.href === "/tdnet-alerts" : link.href === `/${active}`,
    );
    assert.ok(activeLink);
    const activeAnchor = markup.match(new RegExp(`<a[^>]*href="${activeLink.href}"[^>]*>[^<]+</a>`))?.[0];
    assert.ok(activeAnchor);
    assert.match(activeAnchor, /class="site-link active"/);
    assert.match(activeAnchor, /aria-current="page"/);
  });
}
