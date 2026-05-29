with open('app/globals.css', 'r', encoding='utf-8') as f:
    content = f.read()

css_to_add = '''
/* ============================================================
   【デバッグ】横スクロールバー強制適用 (CSS が効いているか確認用)
   thumb=赤 / track=緑 で視覚確認 → 確認後に通常色へ戻す
   ============================================================ */
html body .pl-scroll-area::-webkit-scrollbar,
html body .order-kpi-table-wrap::-webkit-scrollbar,
html body .per-share-table-wrap::-webkit-scrollbar {
  height: 24px !important;
}

html body .pl-scroll-area::-webkit-scrollbar-thumb,
html body .order-kpi-table-wrap::-webkit-scrollbar-thumb,
html body .per-share-table-wrap::-webkit-scrollbar-thumb {
  background-color: #ff0000 !important;
  border-radius: 12px !important;
  border: 4px solid #00ff00 !important;
}

html body .pl-scroll-area::-webkit-scrollbar-track,
html body .order-kpi-table-wrap::-webkit-scrollbar-track,
html body .per-share-table-wrap::-webkit-scrollbar-track {
  background-color: #00ff00 !important;
}
'''

content = content.rstrip() + '\n' + css_to_add

with open('app/globals.css', 'w', encoding='utf-8') as f:
    f.write(content)

print('Done.')
