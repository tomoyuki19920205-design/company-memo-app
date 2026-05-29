with open('app/globals.css', 'r', encoding='utf-8') as f:
    content = f.read()

# 1. pl-scroll-area: overflow-y: auto -> overflow-y: visible
old1 = '.pl-scroll-area {\n  overflow-x: auto;\n  overflow-y: auto;\n  border: 1px solid var(--border-light);\n  border-radius: 0 0 6px 6px;\n}'
new1 = '.pl-scroll-area {\n  overflow-x: auto;\n  overflow-y: visible; /*縦スクロール廃止: 全行表示 */\n  border: 1px solid var(--border-light);\n  border-radius: 0 0 6px 6px;\n}'

if old1 in content:
    content = content.replace(old1, new1, 1)
    print('OK: pl-scroll-area updated')
else:
    print('NOT FOUND: pl-scroll-area')
    idx = content.find('.pl-scroll-area')
    print(repr(content[idx:idx+120]))

# 2. pl-resize-handle: display:none
old2 = '''.pl-resize-handle {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 10px;
  cursor: row-resize;
  background: linear-gradient(to bottom, #1e2d3d, #152232);
  border-radius: 0 0 6px 6px;
  user-select: none;
  transition: background 0.15s;
}

.pl-resize-handle:hover {
  background: linear-gradient(to bottom, #253041, #1e2d3d);
}

.pl-resize-handle:active {
  background: linear-gradient(to bottom, #2d3f53, #253041);
}

.pl-resize-grip {
  font-size: 0.7rem;
  color: #94a3b8;
  letter-spacing: 2px;
  line-height: 1;
}'''
new2 = '''.pl-resize-handle {
  display: none; /* 縦スクロール廃止のため非表示 */
}

.pl-resize-handle:hover {}
.pl-resize-handle:active {}

.pl-resize-grip {
  display: none;
}'''

if old2 in content:
    content = content.replace(old2, new2, 1)
    print('OK: pl-resize-handle hidden')
else:
    print('NOT FOUND: pl-resize-handle')
    idx = content.find('.pl-resize-handle')
    print(repr(content[idx:idx+200]))

with open('app/globals.css', 'w', encoding='utf-8') as f:
    f.write(content)

print('Done.')
