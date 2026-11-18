import copy, csv, importlib.util, json, os, tempfile, unittest
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
def module(name,file):
    s=importlib.util.spec_from_file_location(name,ROOT/'scripts'/file);m=importlib.util.module_from_spec(s);s.loader.exec_module(m);return m
m=module('registry','update-earnings-schedules.py');c=module('collector','collect-tse-schedules.py')
NOW='2026-11-18T08:00:00+09:00'
ROW={'code':'436A','company_name':'試験会社','announcement_date':'2026-12-04','fiscal_year_end':'2027-04-30','quarter':2,'status':'exchange','source_url':'https://example.org/ir','source_published_at':'2026-11-17T15:00:00+09:00'}
class RegistryTests(unittest.TestCase):
    def test_same_target_reimport_and_moved_date_keeps_history(self):
        events={};changes=[];issues=[]
        self.assertEqual(m.upsert(events,ROW,NOW,changes,issues),'added')
        self.assertEqual(m.upsert(events,ROW,NOW,changes,issues),'unchanged')
        changed={**ROW,'announcement_date':'2026-12-07','source_published_at':NOW}
        self.assertEqual(m.upsert(events,changed,NOW,changes,issues),'changed')
        self.assertEqual(len(events),1);r=next(iter(events.values()))
        self.assertEqual(r['status'],'changed');self.assertEqual(r['history'][0]['before']['date'],'2026-12-04')
        self.assertEqual(m.upsert(events,changed,NOW,changes,issues),'unchanged');self.assertEqual(len(events[r['id']]['history']),1)
    def test_older_and_lower_confidence_dates_cannot_overwrite(self):
        e={};ch=[];issues=[];m.upsert(e,ROW,NOW,ch,issues)
        for row in [{**ROW,'announcement_date':'2026-12-01','source_published_at':'2026-11-16T00:00:00+09:00'}, {**ROW,'announcement_date':'2026-12-02','status':'provisional'}]:
            self.assertEqual(m.upsert(e,row,NOW,ch,issues),'unchanged')
        self.assertEqual(len(issues),2);self.assertEqual(next(iter(e.values()))['date'],'2026-12-04')
    def test_announced_requires_evidence_not_past_schedule(self):
        with self.assertRaises(ValueError):m.normalize({**ROW,'status':'announced'},NOW)
        r=m.normalize({**ROW,'announcement_date':'2026-11-01'},NOW)
        self.assertEqual(r['status'],'exchange');self.assertIsNone(r['actualDate'])
        with self.assertRaises(ValueError):m.normalize({**ROW,'status':'announced','actual_date':'2026-12-04'},NOW)
        r=m.normalize({**ROW,'announcement_date':'2026-11-01','status':'announced','actual_date':'2026-11-01'},NOW)
        self.assertEqual(r['actualDate'],'2026-11-01')
    def test_publication_and_retrieval_times_are_not_interchangeable(self):
        e={};ch=[];issues=[]
        m.upsert(e,{**ROW,'source_published_at':''},NOW,ch,issues)
        official={**ROW,'announcement_date':'2026-12-07','status':'official_ir'}
        self.assertEqual(m.upsert(e,official,NOW,ch,issues),'changed')
        self.assertEqual(next(iter(e.values()))['date'],'2026-12-07')
    def test_dates_codes_names_and_future_publications(self):
        for patch in [{'code':'BAD'}, {'announcement_date':'2026-02-30'}, {'quarter':5}, {'status':'made_up'}, {'source_url':'file:///bad'}, {'source_published_at':'2026-12-01T00:00:00Z'}, {'announcement_time':'25:00'}]:
            with self.subTest(patch=patch),self.assertRaises(ValueError):m.normalize({**ROW,**patch},NOW)
        self.assertEqual(m.name_key('（株）テスト　Ａ'),m.name_key('株式会社テストA'))
    def test_no_assumed_dates_and_cautious_calendar_year(self):
        self.assertIsNone(m.derive_target('4月',2,'2026-12-04'))
        self.assertEqual(m.derive_target('4月30日',2,'2026-12-04'),{'fiscalYearEnd':'2027-04-30','quarter':2})
        self.assertEqual(m.derive_target('10月20日',4,'2026-12-04')['fiscalYearEnd'],'2026-10-20')
        self.assertIsNone(m.derive_target('4月30日',2,'2027-04-20'))
        self.assertEqual(m.derive_target('2月末日',3,'2027-01-14')['fiscalYearEnd'],'2027-02-28')
        self.assertEqual(m.derive_target('2月末日',4,'2028-04-14')['fiscalYearEnd'],'2028-02-29')
    def test_resolving_an_unknown_fiscal_year_does_not_duplicate_event(self):
        e={};ch=[];issues=[]
        unresolved={k:v for k,v in ROW.items() if k!='fiscal_year_end'}
        m.upsert(e,unresolved,NOW,ch,issues)
        self.assertEqual(m.upsert(e,ROW,NOW,ch,issues),'changed')
        self.assertEqual(len(e),1);r=next(iter(e.values()))
        self.assertEqual(r['target']['fiscalYearEnd'],ROW['fiscal_year_end'])
        self.assertIsNone(r['history'][0]['before']['target'])
    def test_id_cannot_override_company_period_uniqueness(self):
        e={};ch=[];i=[]
        m.upsert(e,{**ROW,'id':'one'},NOW,ch,i);m.upsert(e,{**ROW,'id':'two'},NOW,ch,i)
        self.assertEqual(len(e),1)
    def test_postponed_without_replacement_date(self):
        e={};ch=[];i=[];m.upsert(e,ROW,NOW,ch,i)
        m.upsert(e,{**ROW,'announcement_date':'','status':'changed','confirmation_status':'exchange'},NOW,ch,i)
        self.assertEqual(next(iter(e.values()))['date'],'')
    def fixture(self,tmp):
        cache=tmp/'cache';store=tmp/'store';cache.mkdir();store.mkdir()
        m.atomic_json(cache/'tse-master.json',{'companies':[{'code':'436A','companyName':'試験会社','market':'グロース','fiscalEndLabel':'4月'},{'code':'1111','companyName':'未確認会社','market':'プライム','fiscalEndLabel':'3月'}],'source':c.ENTRY,'terms':c.TERMS,'checkedAt':NOW})
        m.atomic_json(cache/'tse-436A.json',{'code':'436A','fiscalEndLabel':'4月30日','listingDate':'2025-10-20','checkedAt':NOW,'source':c.ENTRY,'sourcePublishedAt':None,'dates':[{'date':'2026-12-04','quarter':2}]})
        for name in ['index.json','comparison-contexts.json']: (store/name).write_bytes(b'{}')
        (store/'schedules.json').write_bytes(b'[]')
        return cache,store
    def test_resume_no_duplicates_no_forecast_writes_and_master_history_stable(self):
        with tempfile.TemporaryDirectory(dir=os.environ.get('CALENDAR_TEST_TMP')) as d:
            cache,store=self.fixture(Path(d));before={p.name:p.read_bytes() for p in store.iterdir()}
            first=m.update(cache,store,'2026-11-01','2027-04-30',now=NOW)
            r1=m.read_json(store/'registry.json');self.assertEqual(first['stats']['notChecked'],1)
            m.atomic_json(cache/'tse-1111.json',{'code':'1111','fiscalEndLabel':'3月31日','listingDate':'2000-01-01','checkedAt':NOW,'source':c.ENTRY,'dates':[{'date':'2027-02-10','quarter':3}]})
            second=m.update(cache,store,'2026-11-01','2027-04-30',now=NOW)
            self.assertEqual(second['counts'],{'added':1});self.assertEqual(second['stats']['notChecked'],0)
            third=m.update(cache,store,'2026-11-01','2027-04-30',now=NOW)
            r3=m.read_json(store/'registry.json');self.assertEqual(third['counts'],{})
            self.assertEqual(r1['companies'][1]['history'],r3['companies'][1]['history'])
            for name,data in before.items(): self.assertEqual((store/name).read_bytes(),data)
            self.assertFalse((store/'import.lock').exists())
    def test_concurrent_lock_preserves_data(self):
        with tempfile.TemporaryDirectory(dir=os.environ.get('CALENDAR_TEST_TMP')) as d:
            cache,store=self.fixture(Path(d));(store/'import.lock').write_text('running')
            with self.assertRaises(FileExistsError):m.update(cache,store,'2026-11-01','2027-04-30',now=NOW)
            self.assertFalse((store/'registry.json').exists());self.assertTrue((store/'import.lock').exists())
    def test_csv_excel_import_and_error_isolation(self):
        from openpyxl import Workbook
        with tempfile.TemporaryDirectory(dir=os.environ.get('CALENDAR_TEST_TMP')) as d:
            p=Path(d);cache,store=self.fixture(p);file=p/'manual.xlsx';wb=Workbook();ws=wb.active
            ws.append(list(ROW));ws.append(list({**ROW,'announcement_date':'2026-12-05','status':'official_ir','source_published_at':NOW}.values()));ws.append(list({**ROW,'code':'BAD'}.values()));wb.save(file);wb.close()
            r=m.update(cache,store,'2026-11-01','2027-04-30',manual=[file],now=NOW)
            self.assertEqual(len(r['issues']),1);self.assertEqual(r['stats']['changedCompanies'],1)
            e=m.read_json(store/'registry.json')['schedules'][0];self.assertEqual(e['date'],'2026-12-05');self.assertTrue(e['targetConfirmed'])
            csvfile=p/'manual.csv'
            with csvfile.open('w',encoding='utf8',newline='') as f:w=csv.DictWriter(f,fieldnames=ROW.keys());w.writeheader();w.writerow(ROW)
            self.assertEqual(m.input_rows(csvfile)[0]['code'],'436A')
    def test_mismatched_name_quarantined(self):
        with tempfile.TemporaryDirectory(dir=os.environ.get('CALENDAR_TEST_TMP')) as d:
            p=Path(d);cache,store=self.fixture(p);file=p/'bad.csv';m.csv_output(file,[{**ROW,'company_name':'別会社'}],list(ROW))
            r=m.update(cache,store,'2026-11-01','2027-04-30',manual=[file],now=NOW)
            self.assertEqual(len(r['issues']),1);self.assertIn('name mismatch',r['issues'][0]['message'])
    def test_fiscal_period_changes_are_separate_events(self):
        e={};ch=[];i=[];m.upsert(e,ROW,NOW,ch,i);m.upsert(e,{**ROW,'fiscal_year_end':'2027-03-31'},NOW,ch,i)
        self.assertEqual(len(e),2)
    def test_master_code_change_persists_alias_and_event_without_duplicate(self):
        with tempfile.TemporaryDirectory(dir=os.environ.get('CALENDAR_TEST_TMP')) as d:
            p=Path(d);cache,store=self.fixture(p)
            m.update(cache,store,'2026-11-01','2027-04-30',now=NOW)
            file=p/'master.csv';fields=['code','previous_code','company_name','source_url']
            m.csv_output(file,[{'code':'437A','previous_code':'436A','company_name':'新試験会社','source_url':'https://example.org/code-change'}],fields)
            m.update(cache,store,'2026-11-01','2027-04-30',master_updates=[file],now=NOW)
            first=m.read_json(store/'registry.json')
            m.update(cache,store,'2026-11-01','2027-04-30',now=NOW)
            second=m.read_json(store/'registry.json')
            for r in [first,second]:
                self.assertEqual(len(r['companies']),2);self.assertEqual(len(r['schedules']),1)
                self.assertEqual(r['schedules'][0]['code'],'437A')
                self.assertIn('436A',r['schedules'][0]['codeAliases'])
                self.assertEqual(next(c for c in r['companies'] if c['code']=='437A')['companyName'],'新試験会社')
            self.assertEqual(next(c for c in first['companies'] if c['code']=='437A')['history'],next(c for c in second['companies'] if c['code']=='437A')['history'])
    def test_completed_checkpoint_clears_an_old_failure(self):
        with tempfile.TemporaryDirectory(dir=os.environ.get('CALENDAR_TEST_TMP')) as d:
            cache,store=self.fixture(Path(d));m.atomic_json(cache/'tse-failures.json',[{'code':'436A','error':'503'}])
            r=m.update(cache,store,'2026-11-01','2027-04-30',now=NOW)
            self.assertEqual(r['stats']['failed'],0)
    def test_collector_reuses_fresh_cache_without_network(self):
        with tempfile.TemporaryDirectory(dir=os.environ.get('CALENDAR_TEST_TMP')) as d:
            cache,store=self.fixture(Path(d));collector=c.Collector(cache,offline=True)
            self.assertEqual(collector.master()['companies'][0]['code'],'436A')
            done,errors=collector.details([{'code':'436A'},{'code':'1111'}]);self.assertEqual(done,0);self.assertEqual(errors,[])
    def test_bad_excel_file_is_reported_not_silently_empty(self):
        with tempfile.TemporaryDirectory(dir=os.environ.get('CALENDAR_TEST_TMP')) as d:
            p=Path(d);cache,store=self.fixture(p);bad=p/'broken.xlsx';bad.write_bytes(b'bad file')
            r=m.update(cache,store,'2026-11-01','2027-04-30',manual=[bad],now=NOW)
            self.assertEqual(r['issues'][0]['kind'],'import_file_error')
            self.assertTrue((store/'registry.json').exists())
    def test_alternate_window_has_no_fixed_date_or_size(self):
        with tempfile.TemporaryDirectory(dir=os.environ.get('CALENDAR_TEST_TMP')) as d:
            cache,store=self.fixture(Path(d));r=m.update(cache,store,'2027-05-01','2027-10-31',now=NOW)
            self.assertEqual(r['stats']['registeredCompanies'],0);self.assertEqual(r['stats']['master'],2)
    def test_change_outside_requested_window_does_not_leave_stale_day(self):
        with tempfile.TemporaryDirectory(dir=os.environ.get('CALENDAR_TEST_TMP')) as d:
            cache,store=self.fixture(Path(d));m.update(cache,store,'2026-11-01','2026-12-04',now=NOW)
            facts=m.read_json(cache/'tse-436A.json');facts['dates'][0]['date']='2026-12-07';facts['checkedAt']='2026-11-18T09:00:00+09:00';m.atomic_json(cache/'tse-436A.json',facts)
            m.update(cache,store,'2026-11-01','2026-12-04',now='2026-11-18T09:00:00+09:00')
            result=m.read_json(store/'registry.json');self.assertEqual(result['schedules'][0]['date'],'2026-12-07')
            self.assertNotIn('2026-12-04',result['dailyCounts']);self.assertEqual(len(result['schedules'][0]['history']),1)
    def test_source_schema_and_identity_fail_closed(self):
        with self.assertRaises(ValueError):c.parse_list('<html>maintenance</html>')
        with self.assertRaises(ValueError):c.parse_detail('<html>login</html>','2910')
    def test_csv_formula_safety(self):
        with tempfile.TemporaryDirectory(dir=os.environ.get('CALENDAR_TEST_TMP')) as d:
            p=Path(d)/'x.csv';m.csv_output(p,[{'name':'=1+1'}],['name']);self.assertIn("'=1+1",p.read_text(encoding='utf-8-sig'))
if __name__=='__main__': unittest.main()
