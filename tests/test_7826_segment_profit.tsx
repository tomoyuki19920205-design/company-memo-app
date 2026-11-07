import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { buildSegmentInfo } from "../components/FinancialsTable";
import SegmentTable from "../components/SegmentTable";
import type { SegmentRecord } from "../types/segment";
import { segmentProfitLabel } from "../lib/segment-profit";

const names = ["Electronics", "Thin Film", "Thermal", "Fine Chemicals Recycling", "Supply Chain Support", "Other"];
const records: SegmentRecord[] = names.map((name, i) => ({
    ticker:"7826", period:"2027-06-30", quarter:"1Q", segment_name:name,
    segment_sales:[10527,7822,2262,7567,9389,15][i],
    segment_profit:[4837,3533,821,4160,1053,1][i],
    profit_basis:"gross_profit", period_start:"2026-07-01", period_end:"2026-09-30",
    segment_definition:names.join("|"), source:"xbrl", source_priority:1,
}));
test("six disclosed gross profits flow through the existing table model and rendering", () => {
    const info=buildSegmentInfo(records);
    assert.equal(info.segmentColumns.length,6);
    for(const col of info.segmentColumns) {
        assert.match(col.profitLabel,/売上総利益ベース/);
        assert.equal(info.segmentMap.get("2027-06-30|1Q")![col.profitKey], records.find(r=>r.segment_name===col.segmentName)!.segment_profit);
    }
    const html=renderToStaticMarkup(<SegmentTable data={records} loading={false} overrides={[]} />);
    assert.match(html,/セグメント利益（売上総利益ベース）/);
    assert.match(html,/4,837/);
    assert.match(html,/3,533/);
});
test("zero and losses remain visible; only compatible cumulative profits are subtracted",()=>{
    const one={...records[0],segment_profit:0};
    const two={...one,quarter:"2Q",segment_profit:-5,period_end:"2026-12-31"};
    const info=buildSegmentInfo([one,two]);const col=info.segmentColumns[0];
    assert.equal(info.segmentQMap.get("2027-06-30|2Q")![col.profitKey],-5);
    for(const [change, reason] of [[{profit_basis:"operating_profit"},"利益基準"],[{segment_definition:"new"},"セグメント区分"],[{period_start:"2026-08-01"},"累計開始日"]] as const) {
        const incompatible=buildSegmentInfo([one,{...two,...change}]);
        assert.equal(incompatible.segmentQMap.get("2027-06-30|2Q")![col.profitKey],null);
        assert.match(incompatible.segmentQReasons.get(`2027-06-30|2Q|${col.profitKey}`)!,new RegExp(reason));
    }
    assert.equal(buildSegmentInfo([two]).segmentQMap.get("2027-06-30|2Q")![col.profitKey],null);
    assert.match(buildSegmentInfo([two]).segmentQReasons.get(`2027-06-30|2Q|${col.profitKey}`)!,/前四半期/);
    const html=renderToStaticMarkup(<SegmentTable data={[one,two]} loading={false} overrides={[]} />);
    assert.match(html,/>0</);assert.match(html,/-5/);
    assert.equal(segmentProfitLabel("operating_profit"),"セグメント利益（営業利益ベース）");
});
