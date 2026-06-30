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
    endpoint = f'{url}/rest/v1/edinet_order_data?ticker=eq.1420&order=period.desc&limit=10'
    headers = {'apikey': key, 'Authorization': f'Bearer {key}'}
    res = requests.get(endpoint, headers=headers)
    if res.status_code == 200:
        data = res.json()
        print('ROWS:', len(data))
        for row in data:
            print(f"{row.get('period')} - FY: {row.get('fiscal_year')} - seg: {row.get('segment_name')} - src: {row.get('source_type')} - Recv: {row.get('orders_received')}")
    else:
        print('ERROR:', res.text)
