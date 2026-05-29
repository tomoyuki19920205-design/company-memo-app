import re

# ====================================================
# 1. globals.css: デバッグ CSS + 旧 scrollbar CSS 削除 + 新 CSS 追加
# ====================================================
with open('app/globals.css', 'r', encoding='utf-8') as f:
    css = f.read()

# --- 削除: デバッグ赤緑 CSS ---
debug_marker = '/* ============================================================\n   【デバッグ】横スクロールバー強制適用'
if debug_marker in css:
    idx = css.find(debug_marker)
    css = css[:idx].rstrip() + '\n'
    print('OK: removed debug red/green scrollbar CSS')
else:
    print('WARNING: debug CSS not found')

# --- 削除: 旧 scrollbar CSS (実際のコンテナ向け) ---
real_marker = '/* ============================================================\n   実際の横スクロールコンテナのスクロールバーを太く'
if real_marker in css:
    idx = css.find(real_marker)
    css = css[:idx].rstrip() + '\n'
    print('OK: removed real scrollbar CSS')
else:
    print('INFO: real scrollbar CSS not found (may have already been removed)')

# --- body の padding-bottom を 46px に更新 or 追加 ---
# 既存の padding-bottom: 18px を 46px に変更
old_pb = 'padding-bottom: 18px; /* 画面下部固定横スクロールバー分の余白 */'
new_pb = 'padding-bottom: 46px; /* カスタム固定横スクロールバー分の余白 */'
if old_pb in css:
    css = css.replace(old_pb, new_pb, 1)
    print('OK: body padding-bottom updated to 46px')
else:
    print('WARNING: body padding-bottom not found, check manually')

# --- 追加: カスタム固定横スクロールバー CSS ---
custom_css = '''
/* ============================================================
   カスタム固定横スクロール操作バー (input[type=range])
   native scrollbar の代替として画面下部に常時表示
   ============================================================ */
.custom-fixed-x-scroll {
  position: fixed;
  left: 12px;
  right: 12px;
  bottom: 8px;
  height: 34px;
  z-index: 10000;
  background: rgba(26, 37, 53, 0.92);
  border-radius: 12px;
  padding: 6px 12px;
  box-shadow: 0 -2px 8px rgba(0, 0, 0, 0.25);
  display: flex;
  align-items: center;
}

.custom-fixed-x-scroll-range {
  width: 100%;
  height: 22px;
  cursor: pointer;
  -webkit-appearance: none;
  appearance: none;
  background: transparent;
  outline: none;
}

.custom-fixed-x-scroll-range::-webkit-slider-runnable-track {
  height: 14px;
  background: #2d3a4f;
  border-radius: 999px;
}

.custom-fixed-x-scroll-range::-webkit-slider-thumb {
  -webkit-appearance: none;
  width: 42px;
  height: 22px;
  margin-top: -4px;
  background: #7a8799;
  border: 2px solid #d8dee9;
  border-radius: 999px;
  cursor: grab;
}

.custom-fixed-x-scroll-range:active::-webkit-slider-thumb {
  cursor: grabbing;
  background: #94a3b8;
}

/* Firefox */
.custom-fixed-x-scroll-range::-moz-range-track {
  height: 14px;
  background: #2d3a4f;
  border-radius: 999px;
}

.custom-fixed-x-scroll-range::-moz-range-thumb {
  width: 42px;
  height: 22px;
  background: #7a8799;
  border: 2px solid #d8dee9;
  border-radius: 999px;
  cursor: grab;
}
'''

css = css.rstrip() + '\n' + custom_css

with open('app/globals.css', 'w', encoding='utf-8') as f:
    f.write(css)

print('globals.css done.')

# ====================================================
# 2. page.tsx: refs/state/useEffect 追加 + JSX 修正
# ====================================================
with open('app/page.tsx', 'r', encoding='utf-8') as f:
    tsx = f.read()

# --- 追加: undoStackRef の直後に scrollTargetRef / xScrollMax / xScrollLeft / useEffect ---
old_undo = '    const undoStackRef = useRef<UndoEntry[]>([]);\n    const MAX_UNDO = 50;\n\n    const pushUndo'
new_undo = '''    const undoStackRef = useRef<UndoEntry[]>([]);
    const MAX_UNDO = 50;

    // ============================================================
    // カスタム固定横スクロール操作バー
    // ============================================================
    const scrollTargetRef = useRef<HTMLDivElement | null>(null);
    const [xScrollMax, setXScrollMax] = useState(0);
    const [xScrollLeft, setXScrollLeft] = useState(0);

    useEffect(() => {
        const el = scrollTargetRef.current;
        if (!el) return;
        const update = () => {
            setXScrollMax(Math.max(0, el.scrollWidth - el.clientWidth));
            setXScrollLeft(el.scrollLeft);
        };
        update();
        el.addEventListener("scroll", update);
        const ro = new ResizeObserver(update);
        ro.observe(el);
        window.addEventListener("resize", update);
        return () => {
            el.removeEventListener("scroll", update);
            ro.disconnect();
            window.removeEventListener("resize", update);
        };
    }, []);

    const pushUndo'''

if old_undo in tsx:
    tsx = tsx.replace(old_undo, new_undo, 1)
    print('OK: added scrollTargetRef / xScrollMax / xScrollLeft / useEffect')
else:
    print('NOT FOUND: undoStackRef block')

# --- 変更: company-page-x-scroll に ref={scrollTargetRef} を付ける ---
old_div = '<div className="company-page-x-scroll">'
new_div = '<div className="company-page-x-scroll" ref={scrollTargetRef}>'
if old_div in tsx:
    tsx = tsx.replace(old_div, new_div, 1)
    print('OK: added ref={scrollTargetRef} to company-page-x-scroll')
else:
    print('NOT FOUND: company-page-x-scroll div')

# --- 追加: viewer-container 閉じタグの直前に custom-fixed-x-scroll JSX を追加 ---
old_end = '''
        </div>
    );
}
'''
new_end = '''
            {xScrollMax > 0 && (
                <div className="custom-fixed-x-scroll">
                    <input
                        type="range"
                        min={0}
                        max={xScrollMax}
                        value={xScrollLeft}
                        onChange={(e) => {
                            const next = Number(e.target.value);
                            setXScrollLeft(next);
                            if (scrollTargetRef.current) {
                                scrollTargetRef.current.scrollLeft = next;
                            }
                        }}
                        className="custom-fixed-x-scroll-range"
                        aria-label="横スクロール"
                    />
                </div>
            )}
        </div>
    );
}
'''

if old_end in tsx:
    tsx = tsx.replace(old_end, new_end, 1)
    print('OK: added custom-fixed-x-scroll JSX')
else:
    print('NOT FOUND: closing div block')

with open('app/page.tsx', 'w', encoding='utf-8') as f:
    f.write(tsx)

print('page.tsx done.')
