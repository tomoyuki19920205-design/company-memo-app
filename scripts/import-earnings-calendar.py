"""Offline, immutable import. Never connects to Supabase or a paid API.

python scripts/import-earnings-calendar.py --run PATH [--schedule CSV] [--store PATH]
python scripts/import-earnings-calendar.py --schedule CSV [--store PATH]
CSV: code,company_name,announcement_date,status,fiscal_year_end,quarter,source
"""
import argparse
import csv
import hashlib
import json
import os
from datetime import datetime, timezone, timedelta, date
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]
JST = timezone(timedelta(hours=9))
CODE = re.compile(r"^[0-9][0-9A-Z]{3}$")

def read_json(path):
    return json.loads(path.read_text(encoding="utf-8-sig"))

def csv_rows(path):
    if not path.exists():
        return []
    with path.open(encoding="utf-8-sig", newline="") as f:
        return list(csv.DictReader(f))

def atomic_json(path, value):
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(json.dumps(value, ensure_ascii=False, indent=2, allow_nan=False), encoding="utf-8")
    os.replace(tmp, path)

def day(value):
    if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", value or ""):
        raise ValueError("ISO日付が必要です")
    date.fromisoformat(value)
    return value

def target(fy, quarter):
    day(fy)
    q = int(quarter)
    if q not in (1, 2, 3, 4):
        raise ValueError("四半期は1〜4")
    return {"fiscalYearEnd": fy, "quarter": q}

def growth(current, comparison):
    rate, amount = comparison.get("rate"), comparison.get("amount")
    previous = current - amount if current is not None and amount is not None else None
    note = comparison.get("note", "")
    label, tone = "—", "neutral"
    if previous is not None and current is not None:
        if previous < 0:
            label = "黒転" if current >= 0 else "赤縮" if current > previous else "赤拡" if current < previous else "赤字横ばい"
            tone = "positive" if current > previous else "negative" if current < previous else "neutral"
            rate = None
        elif previous > 0 and current < 0:
            label, tone, rate = "赤転", "negative", None
        elif rate is not None:
            label = f"{rate:+.1%}"
            tone = "positive" if rate > 0 else "negative" if rate < 0 else "neutral"
    return {"rate": rate, "label": label, "tone": tone, "note": note}

def import_data(run=None, schedule=None, store=None):
    store = Path(store or ROOT / "server-data/earnings-calendar")
    store.mkdir(parents=True, exist_ok=True)
    (store / "details").mkdir(exist_ok=True)
    (store / "receipts").mkdir(exist_ok=True)
    lock = store / "import.lock"
    with lock.open("x", encoding="utf-8") as f:
        f.write(str(os.getpid()))
    try:
        return _import(run, schedule, store)
    finally:
        lock.unlink()

def _import(run, schedule, store):
    now = datetime.now(JST).isoformat(timespec="seconds")
    schedules = read_json(store / "schedules.json") if (store / "schedules.json").exists() else []
    forecasts = read_json(store / "index.json") if (store / "index.json").exists() else []
    contexts = read_json(store / "comparison-contexts.json") if (store / "comparison-contexts.json").exists() else {}
    receipt = {"at": now, "inserted": [], "skipped": [], "failed": [], "scheduleCount": 0, "apiCost": 0}
    incoming = []
    result_map = {}
    tables = {}
    manifest = {}
    if run:
        run = Path(run).resolve()
        manifest = read_json(run / "run_manifest.json")
        for name in ["summary", "issues", "assumptions", "guidance_comparisons", "schedule_checks"]:
            tables[name] = csv_rows(run / (name + ".csv"))
        checks = {r["code"]: r for r in tables["schedule_checks"]}
        for item in manifest["companies"]:
            code = item["code"]
            check = checks.get(code, {})
            verified = check.get("verified", "").lower() == "true"
            incoming.append({"code": code, "company_name": item["company_name"],
                "announcement_date": check.get("official_date") if verified else item.get("announcement_date"),
                "status": "official" if verified else "unconfirmed",
                "source": check.get("evidence", "手動入力・公式日未確認")})
        seen = set()
        for row in tables["summary"]:
            code = row.get("code", "")
            try:
                if not CODE.fullmatch(code) or code in seen:
                    raise ValueError("企業コード不正またはsummary内重複")
                seen.add(code)
                cp = run / "companies" / code
                result = read_json(cp / "result.json")
                if result["code"] != code:
                    raise ValueError("結果と企業コードが不一致")
                period = result["period"]
                tq = target(period["fiscal_year_end"], period["quarter"])
                if row.get("target_period") and row["target_period"] != result.get("target_period"):
                    raise ValueError("summaryと構造化予測の対象四半期が不一致")
                if not day(period["start"]) <= day(period["end"]) <= period["fiscal_year_end"]:
                    raise ValueError("対象四半期の期間が不正")
                ann = day(result["announcement_date"])
                if row.get("announcement_date") and row["announcement_date"] != ann:
                    raise ValueError("summaryと構造化予測の入力発表日が不一致")
                asof = result["source_as_of"]
                instant = datetime.fromisoformat(asof)
                if instant.tzinfo is None:
                    raise ValueError("基準日時にはタイムゾーンが必要")
                for scenario in ("base", "bear", "bull"):
                    for metric in ("revenue", "operating_profit"):
                        v = result["scenarios"][scenario][metric]
                        if v is not None and (not isinstance(v, (int, float)) or isinstance(v, bool)):
                            raise ValueError("予測値の型が不正")
                base = result["scenarios"]["base"]
                if any(row.get(k, "") != "" and abs(float(row[k]) - base[k]) > 1e-7 for k in ("revenue", "operating_profit") if base[k] is not None):
                    raise ValueError("summaryと構造化予測が不一致")
                report = run / "reports" / (code + ".md")
                review_md = run / "reports" / (code + "_review.md")
                review = read_json(cp / "quality_review.json") if (cp / "quality_review.json").exists() else {}
                paths = [cp / "result.json", report] + [p for p in (review_md, cp / "quality_review.json", cp / "independent_review.json") if p.exists()]
                hashes = {str(p.relative_to(run)).replace("\\", "/"): hashlib.sha256(p.read_bytes()).hexdigest() for p in paths}
                related = {k: [x for x in tables[k] if x.get("code") == code] for k in tables if k != "summary"}
                digest = hashlib.sha256(json.dumps([hashes, related], ensure_ascii=False, sort_keys=True).encode()).hexdigest()
                identity = code + "-" + digest
                contexts[identity] = [{"fiscalYearEnd": h["fiscal_year_end"], "quarter": h["quarter"],
                    "scope": h.get("scope", ""), "accountingBasis": h.get("accounting_basis", ""),
                    "unit": h.get("unit", ""), "sourceIds": h.get("source_ids", [])} for h in result.get("historicals", [])]
                result_map[code] = tq
                if any(f["id"] == identity for f in forecasts):
                    receipt["skipped"].append(code)
                    continue
                item = {"id": identity, "code": code, "companyName": result["company_name"],
                    "announcementDate": ann, "target": tq, "asOf": asof,
                    "version": run.name + " · " + digest[:8],
                    "savedAt": datetime.fromtimestamp(report.stat().st_mtime, JST).isoformat(timespec="seconds"),
                    "quality": result["quality"], "reviewExecuted": bool(review.get("executed")),
                    "reviewPassed": bool(review.get("passed")), "valid": True,
                    "preAnnouncement": instant < datetime.fromisoformat(ann).replace(tzinfo=JST),
                    "revenue": base["revenue"], "operatingProfit": base["operating_profit"],
                    "revenueYoY": growth(base["revenue"], result["comparisons"]["yoy"]["revenue"]),
                    "profitYoY": growth(base["operating_profit"], result["comparisons"]["yoy"]["operating_profit"])}
                detail = {**item, "markdown": report.read_text(encoding="utf-8-sig"),
                    "reviewMarkdown": review_md.read_text(encoding="utf-8-sig") if review_md.exists() else "独立レビューは未作成です。",
                    "result": result, "review": review, "issues": related["issues"],
                    "assumptions": related["assumptions"], "guidance": related["guidance_comparisons"],
                    "scheduleCheck": checks.get(code), "sourceHashes": hashes}
                atomic_json(store / "details" / (identity + ".json"), detail)
                forecasts.append(item)
                receipt["inserted"].append(code)
            except (KeyError, ValueError, TypeError, OSError) as e:
                receipt["failed"].append({"code": code, "stage": "forecast", "reason": str(e)})
    if schedule:
        incoming.extend(csv_rows(Path(schedule)))
    schedule_map = {(s["date"], s["code"]): s for s in schedules}
    for row in incoming:
        try:
            code = row["code"]
            if not CODE.fullmatch(code):
                raise ValueError("企業コード不正")
            scheduled = day(row["announcement_date"])
            status = row.get("status") or "unconfirmed"
            if status not in ("official", "external", "provisional", "unconfirmed"):
                raise ValueError("予定日の確定状態が不正")
            source = row.get("source") or "手動入力"
            if status == "official" and not source.startswith("https://"):
                raise ValueError("公式確定には公式出典URLが必要")
            tq = target(row["fiscal_year_end"], row["quarter"]) if row.get("fiscal_year_end") else result_map.get(code)
            old = schedule_map.get((scheduled, code))
            entry = {"code": code, "companyName": row["company_name"], "date": scheduled,
                "status": status, "target": tq or (old or {}).get("target"), "source": source, "updatedAt": now}
            if old and old["status"] == "official" and status != "official":
                continue  # Never downgrade a separately confirmed schedule implicitly.
            if old and all(old.get(k) == v for k, v in entry.items() if k != "updatedAt"):
                continue
            schedule_map[(scheduled, code)] = entry
        except (KeyError, ValueError, TypeError) as e:
            receipt["failed"].append({"code": row.get("code"), "stage": "schedule", "reason": str(e)})
    atomic_json(store / "comparison-contexts.json", contexts)
    atomic_json(store / "index.json", sorted(forecasts, key=lambda f: (f["code"], f["asOf"], f["savedAt"], f["id"])))
    atomic_json(store / "schedules.json", sorted(schedule_map.values(), key=lambda s: (s["date"], s["code"])))
    receipt["scheduleCount"] = len(schedule_map)
    receipt["forecastCount"] = len(forecasts)
    atomic_json(store / "receipts" / (datetime.now(JST).strftime("%Y%m%d_%H%M%S_%f") + ".json"), receipt)
    return receipt

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--run", type=Path)
    parser.add_argument("--schedule", type=Path)
    parser.add_argument("--store", type=Path)
    args = parser.parse_args()
    if not args.run and not args.schedule:
        parser.error("--run または --schedule が必要です")
    receipt = import_data(args.run, args.schedule, args.store)
    print(json.dumps(receipt, ensure_ascii=False, indent=2))
    raise SystemExit(1 if receipt["failed"] else 0)
