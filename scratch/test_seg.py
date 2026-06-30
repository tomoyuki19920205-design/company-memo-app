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
    for t in ['1420', '1950', '3132', '5401', '7912']:
        endpoint = f'{url}/rest/v1/edinet_order_data?ticker=eq.{t}&order=period.desc&limit=2'
        headers = {'apikey': key, 'Authorization': f'Bearer {key}'}
        res = requests.get(endpoint, headers=headers)
        if res.status_code == 200:
            data = res.json()
            for row in data:
                print(f"{t}: {row.get('period')} - seg: {repr(row.get('segment_name'))}")
