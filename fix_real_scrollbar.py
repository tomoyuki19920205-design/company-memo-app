with open('app/globals.css', 'r', encoding='utf-8') as f:
    content = f.read()

# 末尾の既存 html::-webkit-scrollbar ブロックを削除して書き直す
old_scrollbar = '''
/* ============================================================
   横スクロールバーを太く（約3倍）して掴みやすくする
   縦スクロールバーは変更しない
   ============================================================ */
html::-webkit-scrollbar {
  height: 18px; /* 横スクロールバーの太さ */
}

html::-webkit-scrollbar-thumb {
  background: #555;
  border-radius: 10px;
  border: 3px solid #1a2535;
}

html::-webkit-scrollbar-track {
  background: #1a2535;
}

/* Firefox */
html {
  scrollbar-width: auto;
  scrollbar-color: #555 #1a2535;
}'''

if old_scrollbar in content:
    content = content.replace(old_scrollbar, '', 1)
    print('OK: removed old scrollbar CSS')
else:
    print('WARNING: old scrollbar CSS not found exactly, appending new block anyway')

# 実際のスクロールコンテナは .pl-scroll-area / .order-kpi-table-wrap / .per-share-table-wrap
# html もスクロール可能なのでまとめて適用
new_scrollbar = '''
/* ============================================================
   実際の横スクロールコンテナのスクロールバーを太く（18px）する
   .pl-scroll-area      -- PL表
   .order-kpi-table-wrap -- Order KPI
   .per-share-table-wrap -- Per Share
   html                  -- ページ全体
   ============================================================ */
.pl-scroll-area::-webkit-scrollbar,
.order-kpi-table-wrap::-webkit-scrollbar,
.per-share-table-wrap::-webkit-scrollbar,
html::-webkit-scrollbar {
  height: 18px;
}

.pl-scroll-area::-webkit-scrollbar-thumb,
.order-kpi-table-wrap::-webkit-scrollbar-thumb,
.per-share-table-wrap::-webkit-scrollbar-thumb,
html::-webkit-scrollbar-thumb {
  background: #4a5568;
  border-radius: 10px;
  border: 3px solid #1a2535;
}

.pl-scroll-area::-webkit-scrollbar-track,
.order-kpi-table-wrap::-webkit-scrollbar-track,
.per-share-table-wrap::-webkit-scrollbar-track,
html::-webkit-scrollbar-track {
  background: #1a2535;
}

/* Firefox */
.pl-scroll-area,
.order-kpi-table-wrap,
.per-share-table-wrap,
html {
  scrollbar-color: #4a5568 #1a2535;
  scrollbar-width: auto;
}'''

content = content.rstrip() + '\n' + new_scrollbar + '\n'

with open('app/globals.css', 'w', encoding='utf-8') as f:
    f.write(content)

print('Done.')
