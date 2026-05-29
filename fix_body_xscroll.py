
# ====================================================
# 1. page.tsx: fixed-x-scrollbar 関連を削除
# ====================================================
with open('app/page.tsx', 'r', encoding='utf-8') as f:
    tsx = f.read()

# --- 削除: 固定スクロールバー useRef / useState / useEffect 2本 ---
old_block = '''    // ============================================================
    // 画面下部固定横スクロールバー
    // ============================================================
    const mainScrollRef = useRef<HTMLDivElement | null>(null);
    const bottomScrollRef = useRef<HTMLDivElement | null>(null);
    const [scrollWidth, setScrollWidth] = useState(0);

    // main ↔ bottom の scrollLeft 同期
    useEffect(() => {
        const main = mainScrollRef.current;
        const bottom = bottomScrollRef.current;
        if (!main || !bottom) return;
        let syncing = false;
        const syncFromMain = () => {
            if (syncing) return;
            syncing = true;
            bottom.scrollLeft = main.scrollLeft;
            syncing = false;
        };
        const syncFromBottom = () => {
            if (syncing) return;
            syncing = true;
            main.scrollLeft = bottom.scrollLeft;
            syncing = false;
        };
        main.addEventListener("scroll", syncFromMain);
        bottom.addEventListener("scroll", syncFromBottom);
        return () => {
            main.removeEventListener("scroll", syncFromMain);
            bottom.removeEventListener("scroll", syncFromBottom);
        };
    }, []);

    // innerへの幅を scrollWidth に合わせる
    useEffect(() => {
        const main = mainScrollRef.current;
        if (!main) return;
        const update = () => setScrollWidth(main.scrollWidth);
        update();
        const ro = new ResizeObserver(update);
        ro.observe(main);
        window.addEventListener("resize", update);
        return () => {
            ro.disconnect();
            window.removeEventListener("resize", update);
        };
    }, []);

'''
if old_block in tsx:
    tsx = tsx.replace(old_block, '', 1)
    print('OK: removed fixed scrollbar refs/useEffects')
else:
    print('NOT FOUND: fixed scrollbar block')

# --- 変更: ref={mainScrollRef} を company-page-x-scroll から削除 ---
tsx = tsx.replace(
    '<div className="company-page-x-scroll" ref={mainScrollRef}>',
    '<div className="company-page-x-scroll">',
)
print('OK: removed ref from company-page-x-scroll')

# --- 削除: JSX の fixed-x-scrollbar ---
old_fixed_jsx = '''            {/* 画面下部固定横スクロールバー */}
            <div className="fixed-x-scrollbar" ref={bottomScrollRef}>
                <div className="fixed-x-scrollbar-inner" style={{ width: scrollWidth }} />
            </div>'''
if old_fixed_jsx in tsx:
    tsx = tsx.replace(old_fixed_jsx, '', 1)
    print('OK: removed fixed-x-scrollbar JSX')
else:
    print('NOT FOUND: fixed-x-scrollbar JSX')

with open('app/page.tsx', 'w', encoding='utf-8') as f:
    f.write(tsx)

print('page.tsx done.')

# ====================================================
# 2. globals.css: CSS 修正
# ====================================================
with open('app/globals.css', 'r', encoding='utf-8') as f:
    css = f.read()

# (A) body の padding-bottom はそのまま残す（念のため）
# (B) body に overflow-x: auto は追加しない（html に付ける）

# html { } がなければ body の直前に追加
# body の overflow-x は追加しない（html側で制御する）

# html ブロックを探す
if 'html {' not in css and 'html,' not in css:
    # body の直前に html { overflow-x: auto; } を追加
    old_body_top = 'body {\n  font-family: var(--font);'
    new_body_top = 'html {\n  overflow-x: auto;\n}\n\nbody {\n  font-family: var(--font);'
    if old_body_top in css:
        css = css.replace(old_body_top, new_body_top, 1)
        print('OK: html { overflow-x: auto } added before body')
    else:
        print('NOT FOUND: body block')
else:
    print('html block already exists, skipping')

# (C) company-page-x-scroll: overflow-x: auto → visible
old_xscroll = '''.company-page-x-scroll {
  width: 100%;
  overflow-x: auto;
  overflow-y: visible;
}'''
new_xscroll = '''.company-page-x-scroll {
  width: 100%;
  overflow-x: visible; /* html/body で横スクロールするためここは visible */
  overflow-y: visible;
}'''
if old_xscroll in css:
    css = css.replace(old_xscroll, new_xscroll, 1)
    print('OK: company-page-x-scroll updated to visible')
else:
    print('NOT FOUND: company-page-x-scroll')
    idx = css.find('.company-page-x-scroll')
    print(repr(css[idx:idx+120]))

# (D) data-section の overflow-x: visible はすでに設定済みなので確認のみ
if 'overflow-x: visible;' in css and '.data-section' in css:
    print('OK: data-section overflow-x: visible already set')

# (E) fixed-x-scrollbar CSS は残しておいてもよいが不要なので削除
old_fixed_css = '''
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
}'''
if old_fixed_css in css:
    css = css.replace(old_fixed_css, '', 1)
    print('OK: fixed-x-scrollbar CSS removed')
else:
    print('fixed-x-scrollbar CSS not found (already removed or different whitespace)')

with open('app/globals.css', 'w', encoding='utf-8') as f:
    f.write(css)

print('globals.css done.')
