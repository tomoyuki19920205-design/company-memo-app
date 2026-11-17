import importlib.util
import json
import os
import shutil
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("importer", ROOT / "scripts/import-earnings-calendar.py")
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
SOURCE = ROOT.parent / "earnings-forecast-system/runs/20261204_asof20261117_1709_quality_v2"

class ImportTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(dir=os.environ.get("CALENDAR_TEST_TMP"))
        self.root = Path(self.tmp.name)
        self.store = self.root / "store"
    def tearDown(self):
        self.tmp.cleanup()
    def test_real_reimport_and_original_hashes(self):
        before = {p: module.hashlib.sha256(p.read_bytes()).hexdigest() for p in SOURCE.glob("reports/*.md")}
        first = module.import_data(SOURCE, store=self.store)
        second = module.import_data(SOURCE, store=self.store)
        self.assertEqual(len(first["inserted"]),12)
        self.assertEqual(len(second["skipped"]),12)
        self.assertEqual(second["forecastCount"],12)
        self.assertEqual(second["scheduleCount"],12)
        self.assertEqual(before,{p:module.hashlib.sha256(p.read_bytes()).hexdigest() for p in before})
    def test_schedule_without_forecast_and_other_date(self):
        csv = self.root/"schedule.csv"
        csv.write_text("code,company_name,announcement_date,status,fiscal_year_end,quarter,source\n1873,日本ハウス,2027-03-05,provisional,2027-04-30,3,試験日\n",encoding="utf-8")
        result=module.import_data(schedule=csv,store=self.store)
        self.assertEqual(result["forecastCount"],0)
        self.assertEqual(result["scheduleCount"],1)
    def test_revision_retained_partial_failure_and_invalid_code(self):
        run=self.root/"run"
        run.mkdir()
        for name in ("summary.csv","issues.csv","assumptions.csv","guidance_comparisons.csv","schedule_checks.csv","run_manifest.json"):
            shutil.copyfile(SOURCE/name,run/name)
        for code in ("1873","2353"):
            (run/"companies"/code).mkdir(parents=True)
            shutil.copyfile(SOURCE/"companies"/code/"result.json",run/"companies"/code/"result.json")
        (run/"reports").mkdir()
        for code in ("1873","2353"):
            shutil.copyfile(SOURCE/"reports"/(code+".md"),run/"reports"/(code+".md"))
        first=module.import_data(run,store=self.store)
        self.assertEqual(len(first["inserted"]),2)
        self.assertEqual(len(first["failed"]),10)
        with (run/"reports/1873.md").open("a",encoding="utf-8") as f:f.write("\n版管理テスト")
        second=module.import_data(run,store=self.store)
        self.assertEqual(second["forecastCount"],3)
        self.assertEqual(len(list((self.store/"details").glob("1873-*.json"))),2)
        csv=self.root/"bad.csv"
        csv.write_text("code,company_name,announcement_date\n../x,不正,2026-12-04\n1111,不正日,2026-02-30\n",encoding="utf-8")
        self.assertEqual(len(module.import_data(schedule=csv,store=self.store)["failed"]),2)
    def test_lock_prevents_concurrent_mutation(self):
        self.store.mkdir()
        (self.store/"import.lock").write_text("existing")
        with self.assertRaises(FileExistsError):module.import_data(SOURCE,store=self.store)

if __name__=="__main__":unittest.main()
