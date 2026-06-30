import os
import requests

env = {}
for line in open('.env.local', encoding='utf-8').read().splitlines():
    if '=' in line:
        k, v = line.split('=', 1)
        env[k.strip()] = v.strip().strip('\"\'')

url = env.get('NEXT_PUBLIC_SUPABASE_URL')
key = env.get('NEXT_PUBLIC_SUPABASE_ANON_KEY')

if url and key:
    headers = {'apikey': key, 'Authorization': f'Bearer {key}'}
    # Query by ticker 8136
    res1 = requests.get(f"{url}/rest/v1/tdnet_events", params={'ticker': 'eq.8136', 'limit': 10}, headers=headers)
    print('8136 count:', len(res1.json()) if res1.status_code == 200 else res1.text)
    
    # Query by ticker 81360
    res2 = requests.get(f"{url}/rest/v1/tdnet_events", params={'ticker': 'eq.81360', 'limit': 10}, headers=headers)
    print('81360 count:', len(res2.json()) if res2.status_code == 200 else res2.text)

    # Query by company name containing サンリオ
    res3 = requests.get(f"{url}/rest/v1/tdnet_events", params={'company_name': 'like.*サンリオ*', 'limit': 10}, headers=headers)
    if res3.status_code == 200:
        print('サンリオ name count:', len(res3.json()))
        for row in res3.json():
            print(f"{row.get('ticker')} - {row.get('disclosed_at')} - {row.get('event_type')} - {row.get('headline').encode('utf-8').decode('utf-8')}")
    else:
        print('Error:', res3.text)
