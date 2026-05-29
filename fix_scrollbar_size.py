with open('app/globals.css', 'r', encoding='utf-8') as f:
    content = f.read()

css_to_add = '''
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
}
'''

content = content.rstrip() + '\n' + css_to_add

with open('app/globals.css', 'w', encoding='utf-8') as f:
    f.write(content)

print('Done.')
