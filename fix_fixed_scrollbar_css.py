with open('app/globals.css', 'r', encoding='utf-8') as f:
    content = f.read()

css_to_add = '''
/* ============================================================
   画面下部固定横スクロールバー
   ============================================================ */
.fixed-x-scrollbar {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  height: 18px;
  overflow-x: auto;
  overflow-y: hidden;
  z-index: 9999;
  background: rgba(15, 20, 27, 0.97);
  border-top: 1px solid rgba(255, 255, 255, 0.08);
}

.fixed-x-scrollbar-inner {
  height: 1px;
}
'''

# body に padding-bottom を追加（固定バーに隠れないよう）
old_body = '''body {
  font-family: var(--font);
  background: var(--bg);
  color: var(--text);
  line-height: 1.5;
  min-height: 100vh;
}'''
new_body = '''body {
  font-family: var(--font);
  background: var(--bg);
  color: var(--text);
  line-height: 1.5;
  min-height: 100vh;
  padding-bottom: 18px; /* 画面下部固定横スクロールバー分の余白 */
}'''

if old_body in content:
    content = content.replace(old_body, new_body, 1)
    print('OK: body padding-bottom added')
else:
    print('NOT FOUND: body')

# ファイル末尾に CSS を追加
content = content.rstrip() + '\n' + css_to_add

with open('app/globals.css', 'w', encoding='utf-8') as f:
    f.write(content)

print('Done.')
