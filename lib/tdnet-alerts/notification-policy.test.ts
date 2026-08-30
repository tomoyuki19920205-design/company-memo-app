import assert from "node:assert/strict";
import test from "node:test";
import {
  isCorrectionDisclosureTitle,
  isNotificationEventVisible,
  normalizeNotificationTitle,
} from "./notification-policy";

const corrections = [
  '(訂正・数値データ訂正)「2026年６月期決算短信〔日本基準〕(連結)」の一部訂正について',
  '(訂正)「2026年6月期決算短信」の一部訂正について',
  '（訂正）「2026年6月期決算短信」の一部訂正について',
  '(訂正・数値データ訂正)「2026年6月期決算短信」の一部訂正について',
  '（訂正・数値データ訂正）「2026年6月期決算短信」の一部訂正について',
  '決算短信の一部訂正',
  '決算短信の再訂正',
  '決算短信の数値データ訂正',
  '決算短信 訂正について',
  '決算短信 訂正のお知らせ',
  '決算短信の一部変更',
];

for (const title of corrections) {
  test(`excludes correction: ${title}`, () => {
    assert.equal(isCorrectionDisclosureTitle(title), true);
    assert.equal(isNotificationEventVisible({ headline: title } as never), false);
  });
}

const normalDisclosures = [
  '2026年6月期決算短信〔日本基準〕(連結)',
  '通期業績予想の修正に関するお知らせ',
  '配当予想の修正に関するお知らせ',
  '決算期変更のお知らせ',
];

for (const title of normalDisclosures) {
  test(`keeps normal disclosure: ${title}`, () => {
    assert.equal(isCorrectionDisclosureTitle(title), false);
    assert.equal(isNotificationEventVisible({ headline: title } as never), true);
  });
}

test("normalizes NFKC, full-width parentheses, whitespace, and trim", () => {
  assert.equal(normalizeNotificationTitle('  （ 訂正 ）\u3000 決算短信  '), '( 訂正 ) 決算短信');
});

test("filtering preserves order and keeps distinct normal events", () => {
  const events = [
    { id: 'original', headline: normalDisclosures[0] },
    { id: 'correction', headline: corrections[2] },
    { id: 'forecast', headline: normalDisclosures[1] },
    { id: 'dividend', headline: normalDisclosures[2] },
  ];
  assert.deepEqual(events.filter(isNotificationEventVisible).map((event) => event.id), [
    'original',
    'forecast',
    'dividend',
  ]);
});
