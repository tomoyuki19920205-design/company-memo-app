import { NextRequest, NextResponse } from "next/server";
import { readFileSync, existsSync } from "fs";
import { join } from "path";
import Database from "better-sqlite3";

/**
 * GET /api/pdf?ticker=1801&filing_date=2026-02-06
 *
 * OneDrive側 backfill_state.db から filing_id を特定し、
 * tdnet_cache/{filing_id}/source.pdf を返す。
 */

const ONEDRIVE_STATE_DB = "C:\\Users\\takuy\\OneDrive\\tdnet-excel-input\\data\\backfill_state.db";
const ONEDRIVE_CACHE_DIR = "C:\\Users\\takuy\\OneDrive\\tdnet-excel-input\\data\\tdnet_cache";
const LOCAL_CACHE_DIR = join(process.cwd(), "..", "tdnet-pipeline", "data", "tdnet_pdf_cache");

function findPdfPath(ticker: string, filingDate: string): string | null {
    // 1. Try backfill_state.db
    if (existsSync(ONEDRIVE_STATE_DB)) {
        try {
            const db = new Database(ONEDRIVE_STATE_DB, { readonly: true });
            const rows = db.prepare(
                `SELECT filing_id, cache_dir FROM filing_state
                 WHERE ticker = ? AND disclosure_date = ? AND has_pdf = 1
                 ORDER BY disclosure_date DESC LIMIT 1`
            ).all(ticker, filingDate) as Array<{ filing_id: string; cache_dir: string | null }>;
            db.close();

            for (const row of rows) {
                // cache_dir 指定あり
                if (row.cache_dir) {
                    const p = join(row.cache_dir, "source.pdf");
                    if (existsSync(p)) return p;
                }
                // OneDrive cache dir
                const p = join(ONEDRIVE_CACHE_DIR, row.filing_id, "source.pdf");
                if (existsSync(p)) return p;
                // Local cache
                const p2 = join(LOCAL_CACHE_DIR, row.filing_id, "filing.pdf");
                if (existsSync(p2)) return p2;
            }
        } catch (err) {
            console.warn("[api/pdf] DB error:", err);
        }
    }

    // 2. Try fuzzy match by date range (filing_date ± 1 day)
    if (existsSync(ONEDRIVE_STATE_DB)) {
        try {
            const db = new Database(ONEDRIVE_STATE_DB, { readonly: true });
            const rows = db.prepare(
                `SELECT filing_id, cache_dir, disclosure_date FROM filing_state
                 WHERE ticker = ? AND has_pdf = 1
                 AND disclosure_date BETWEEN date(?, '-1 day') AND date(?, '+1 day')
                 ORDER BY disclosure_date DESC LIMIT 3`
            ).all(ticker, filingDate, filingDate) as Array<{ filing_id: string; cache_dir: string | null; disclosure_date: string }>;
            db.close();

            for (const row of rows) {
                if (row.cache_dir) {
                    const p = join(row.cache_dir, "source.pdf");
                    if (existsSync(p)) return p;
                }
                const p = join(ONEDRIVE_CACHE_DIR, row.filing_id, "source.pdf");
                if (existsSync(p)) return p;
            }
        } catch (err) {
            console.warn("[api/pdf] fuzzy search error:", err);
        }
    }

    return null;
}

export async function GET(request: NextRequest) {
    const { searchParams } = new URL(request.url);
    const ticker = searchParams.get("ticker");
    const filingDate = searchParams.get("filing_date");

    if (!ticker || !filingDate) {
        return NextResponse.json(
            { error: "ticker and filing_date are required" },
            { status: 400 }
        );
    }

    const pdfPath = findPdfPath(ticker, filingDate);

    if (!pdfPath) {
        return NextResponse.json(
            { error: "PDF not found", ticker, filingDate },
            { status: 404 }
        );
    }

    try {
        const buffer = readFileSync(pdfPath);
        return new NextResponse(buffer, {
            status: 200,
            headers: {
                "Content-Type": "application/pdf",
                "Content-Disposition": `inline; filename="${ticker}_${filingDate}.pdf"`,
                "Content-Length": String(buffer.length),
            },
        });
    } catch (err) {
        console.error("[api/pdf] read error:", err);
        return NextResponse.json(
            { error: "Failed to read PDF" },
            { status: 500 }
        );
    }
}
