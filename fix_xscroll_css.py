import re

with open('app/globals.css', 'r', encoding='utf-8') as f:
    content = f.read()

# 1. data-section の overflow: hidden を overflow-x: visible / overflow-y: hidden に変更
# ただし data-section のものだけ変更（他の overflow: hidden は手を付けない）
old_ds = '''.data-section {
  background: var(--card-bg);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  overflow: hidden;
  box-shadow: var(--shadow-sm);
  outline: none;
}'''
new_ds = '''.data-section {
  background: var(--card-bg);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  overflow-x: visible; /* ページ全体横スクロールを通すため hidden を解除 */
  overflow-y: hidden;
  box-shadow: var(--shadow-sm);
  outline: none;
}'''

if old_ds in content:
    content = content.replace(old_ds, new_ds, 1)
    print('OK: data-section overflow updated')
else:
    print('NOT FOUND: data-section')
    idx = content.find('.data-section {')
    print(repr(content[idx:idx+200]))

# 2. viewer-main の後にページ全体横スクロール CSS を追加
old_vm = '''.viewer-main {
  display: flex;
  flex-direction: column;
  gap: 8px;
}'''
new_vm = '''.viewer-main {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

/* ============================================================
   ページ全体横スクロールラッパー
   PL表・セグメント表など横長コンテンツをページ下部でスクロール可能にする
   ============================================================ */
.company-page-x-scroll {
  width: 100%;
  overflow-x: auto;
  overflow-y: visible;
}

.company-page-wide-content {
  min-width: max-content;
}'''

if old_vm in content:
    content = content.replace(old_vm, new_vm, 1)
    print('OK: viewer-main CSS + company-page-x-scroll added')
else:
    print('NOT FOUND: viewer-main')
    idx = content.find('.viewer-main')
    print(repr(content[idx:idx+100]))

with open('app/globals.css', 'w', encoding='utf-8') as f:
    f.write(content)

print('Done.')
