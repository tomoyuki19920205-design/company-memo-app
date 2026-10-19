/** Render a locally isolated, saved forecast event through the production card. */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ForecastReason from "../components/tdnet-alerts/ForecastReason";
import { getForecastReason } from "../lib/tdnet-alerts/forecast-reason";
import type { TdnetEvent } from "../lib/tdnet-alerts/types";

const path=process.env.ISOLATED_EVENT_PATH;
assert.ok(path,"ISOLATED_EVENT_PATH is required");
const event=JSON.parse(readFileSync(path,"utf8")) as TdnetEvent;
const data=getForecastReason(event);
assert.equal(data.status,"available");
assert.ok(data.sections.length>0);
const html=renderToStaticMarkup(<ForecastReason event={event} />);
for (const section of data.sections) {
  const escaped=section.text.replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;")
    .replaceAll('"',"&quot;").replaceAll("'","&#x27;");
  assert.ok(html.includes(escaped),"full original text through its final line");
  assert.ok(html.includes(`${section.source_url || data.url}#page=${section.page_start}`));
}
const raw=typeof event.raw_payload==="string"?JSON.parse(event.raw_payload):event.raw_payload;
const expected=raw.extracted.revision_reason.sections[0].text_sha256;
assert.equal(createHash("sha256").update(data.sections[0].text).digest("hex"),expected);
console.log(JSON.stringify({notification_id:event.id,status:data.status,sections:data.sections.length,
  characters:data.sections.reduce((n,s)=>n+s.text.length,0),text_sha256:expected,
  original_link:data.sections[0].source_url || data.url}));
