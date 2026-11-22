import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import TopNavigation from "../components/TopNavigation";

const expectedLinks = [
  { label: "COMPANY VIEWER", href: "/tdnet-alerts" },
  { label: "SCREENING", href: "/screening" },
  { label: "NEWS", href: "/news" },
  { label: "信用買い残", href: "/margin-interest" },
  { label: "カレンダー", href: "/earnings-calendar" },
  { label: "IV", href: "https://nikkei-iv-snapshot-mikami.beautifulbiscuit16.chatgpt.site" },
] as const;

test("preserves the five shared navigation links and appends IV exactly once", () => {
  const markup = renderToStaticMarkup(<TopNavigation active="company" />);
  assert.equal((markup.match(/<a\b/g) ?? []).length, expectedLinks.length);
  assert.equal((markup.match(/>IV<\/a>/g) ?? []).length, 1);
  let previousIndex = -1;

  for (const link of expectedLinks) {
    const index = markup.indexOf(`href="${link.href}"`);
    assert.ok(index > previousIndex, `${link.label} should follow the previous link`);
    assert.match(markup, new RegExp(`href="${link.href}"[^>]*>${link.label}</a>`));
    previousIndex = index;
  }
});

test("IV uses a native same-tab anchor without router or click interception", () => {
  const navigation = TopNavigation({ active: "company" });
  const iv = navigation.props.children.find((item: React.ReactElement) => item.key === "iv");
  assert.ok(iv);
  assert.equal(iv.type, "a");
  assert.equal(iv.props.href, expectedLinks[5].href);
  assert.equal(iv.props.className, "site-link");
  for (const prop of ["target", "onClick", "onClickCapture", "onMouseDown", "onKeyDown", "aria-current"]) {
    assert.equal(iv.props[prop], undefined, `${prop} should leave standard browser behavior intact`);
  }
});

for (const active of ["company", "screening", "news", "margin", "calendar"] as const) {
  test(`marks only ${active} as the active page`, () => {
    const markup = renderToStaticMarkup(<TopNavigation active={active} />);
    assert.equal((markup.match(/aria-current="page"/g) ?? []).length, 1);
    assert.equal((markup.match(/class="site-link active"/g) ?? []).length, 1);
    const activeHref = active === "company" ? "/tdnet-alerts" : active === "margin" ? "/margin-interest" : active === "calendar" ? "/earnings-calendar" : `/${active}`;
    const activeLink = expectedLinks.find((link) => link.href === activeHref);
    assert.ok(activeLink);
    const activeAnchor = markup.match(new RegExp(`<a[^>]*href="${activeLink.href}"[^>]*>[^<]+</a>`))?.[0];
    assert.ok(activeAnchor);
    assert.match(activeAnchor, /class="site-link active"/);
    assert.match(activeAnchor, /aria-current="page"/);
  });
}
