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

test("hides the October 13 Watts and OSG result cards without touching their IDs", () => {
  const title = "自己株式立会外買付取引（ToSTNeT-3）による自己株式の取得結果に関するお知らせ";
  const events = [
    { id: "7ced180f-0ace-4018-a972-458c51c00dc9", event_type: "buyback", event_subtype: "tostnet", headline: title, raw_payload: { extracted: { event_type: "buyback_result" } } },
    { id: "17bcf838-7a87-4200-9557-81b35f258937", event_type: "buyback", event_subtype: "tostnet", headline: title, raw_payload: JSON.stringify({ extracted: { event_type: "buyback_result" } }) },
  ];
  assert.deepEqual(events.filter(isNotificationEventVisible), []);
  assert.deepEqual(events.map((event) => event.id), ["7ced180f-0ace-4018-a972-458c51c00dc9", "17bcf838-7a87-4200-9557-81b35f258937"]);
});

test("hides status and completion while keeping new decisions and mixed disclosures", () => {
  const buyback = (headline: string, extractedType?: string) => ({
    event_type: "buyback", headline, raw_payload: { extracted: { event_type: extractedType } },
  });
  for (const headline of [
    "自己株式の取得状況に関するお知らせ（9月度）",
    "自己株式の取得に関する月次進捗のお知らせ",
    "自己株式の取得結果及び取得終了に関するお知らせ",
    "自己株式の取得完了に関するお知らせ",
    "自己株式立会外買付取引（ToSTNeT-3）による買付結果について",
  ]) assert.equal(isNotificationEventVisible(buyback(headline)), false, headline);
  for (const headline of [
    "自己株式の取得に係る事項の決定に関するお知らせ",
    "自己株式取得枠の拡大に関するお知らせ",
    "自己株式の取得及び取得結果の公表に関するお知らせ",
    "自己株式の取得に係る事項の決定及び取得結果に関するお知らせ",
  ]) assert.equal(isNotificationEventVisible(buyback(headline, "buyback_result")), true, headline);
  assert.equal(isNotificationEventVisible(buyback("自己株式の取得結果について", "buyback_result")), false,
    "a prior board resolution in the result body must not create a fresh alert");
  assert.equal(isNotificationEventVisible({ event_type: "earnings", headline: "取得結果に関する決算説明資料" }), true,
    "other categories retain their notification policy");
});
