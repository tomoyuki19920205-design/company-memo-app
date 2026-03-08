/**
 * Excel / TSV 由来のクリップボードテキストを正しくパースする。
 *
 * Excel は複数セルをコピーすると text/plain に TSV 形式で出力する。
 * セル内に改行・タブ・ダブルクォートが含まれる場合、
 * Excel はそのセルをダブルクォートで囲み、内部のダブルクォートは "" にエスケープする。
 *
 * 例:
 *   セルA1 = "hello"        セルB1 = "world"
 *   セルA2 = "line1\nline2" セルB2 = "test"
 *
 *   クリップボード text/plain:
 *   hello\tworld\r\n"line1\nline2"\ttest\r\n
 *
 * このパーサは:
 * - ダブルクォートで囲まれたフィールド内の改行をセル内改行として扱う
 * - ダブルクォート内の "" をリテラル " に変換する
 * - \t をセル境界として扱う
 * - \r\n, \n, \r を行境界として扱う（ただしクォート内は除く）
 */
export function parseTsvClipboard(text: string): string[][] {
    if (!text) return [];

    const rows: string[][] = [];
    let currentRow: string[] = [];
    let currentField = "";
    let inQuotes = false;
    let i = 0;

    while (i < text.length) {
        const ch = text[i];

        if (inQuotes) {
            if (ch === '"') {
                // 次も " なら escaped quote
                if (i + 1 < text.length && text[i + 1] === '"') {
                    currentField += '"';
                    i += 2;
                } else {
                    // クォート終了
                    inQuotes = false;
                    i++;
                }
            } else {
                // クォート内の文字はそのまま（改行含む）
                currentField += ch;
                i++;
            }
        } else {
            if (ch === '"' && currentField === "") {
                // フィールド開始時の " → クォートモード開始
                inQuotes = true;
                i++;
            } else if (ch === '\t') {
                // タブ → セル境界
                currentRow.push(currentField);
                currentField = "";
                i++;
            } else if (ch === '\r' && i + 1 < text.length && text[i + 1] === '\n') {
                // \r\n → 行境界
                currentRow.push(currentField);
                currentField = "";
                rows.push(currentRow);
                currentRow = [];
                i += 2;
            } else if (ch === '\n' || ch === '\r') {
                // \n or \r → 行境界
                currentRow.push(currentField);
                currentField = "";
                rows.push(currentRow);
                currentRow = [];
                i++;
            } else {
                currentField += ch;
                i++;
            }
        }
    }

    // 最後のフィールド/行を処理
    if (currentField !== "" || currentRow.length > 0) {
        currentRow.push(currentField);
        rows.push(currentRow);
    }

    // 末尾の空行を除去 (Excel は末尾に \r\n を付けることがある)
    while (rows.length > 0) {
        const lastRow = rows[rows.length - 1];
        if (lastRow.length === 1 && lastRow[0] === "") {
            rows.pop();
        } else {
            break;
        }
    }

    return rows;
}
