/** Add one visual blank line only between bullets inside earnings reason sections. */
export function spaceEarningsReasonItems(text: string): string {
  if (!text.includes("増減理由")) return text;

  const newline = text.includes("\r\n") ? "\r\n" : "\n";
  const lines = text.split(/\r\n|\n|\r/);
  const displayed: string[] = [];
  let inReason = false;
  let hasPreviousItem = false;
  let changed = false;

  for (const line of lines) {
    if (/^\s*■\s*増減理由/.test(line)) {
      inReason = true;
      hasPreviousItem = false;
    } else if (/^\s*■/.test(line)) {
      inReason = false;
      hasPreviousItem = false;
    }

    if (inReason && /^\s*・/.test(line)) {
      if (hasPreviousItem) {
        let trailingBlankLines = 0;
        for (let i = displayed.length - 1; i >= 0 && displayed[i].trim() === ""; i--) {
          trailingBlankLines++;
        }
        if (trailingBlankLines === 0) {
          displayed.push("");
          changed = true;
        } else if (trailingBlankLines > 1) {
          displayed.splice(displayed.length - trailingBlankLines, trailingBlankLines - 1);
          changed = true;
        }
      }
      hasPreviousItem = true;
    }
    displayed.push(line);
  }

  return changed ? displayed.join(newline) : text;
}
