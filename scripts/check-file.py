import os

filepath = os.path.join("C:", os.sep, "Users", "takuy", ".gemini", "antigravity", "company-memo-app", "components", "FinancialsTable.tsx")

with open(filepath, "rb") as f:
    raw = f.read()

crlf_count = raw.count(b"\r\n")
lf_only = raw.count(b"\n") - crlf_count
lines = raw.decode("utf-8").splitlines()
print(f"File size: {len(raw)} bytes")
print(f"CRLF: {crlf_count}, LF-only: {lf_only}")
print(f"Total lines: {len(lines)}")

# Check if key markers exist
text = raw.decode("utf-8")
# Normalize
text_norm = text.replace("\r\n", "\n")

print(f"\nKey markers (normalized to LF):")
print(f"  'CUM_BASE_COL_COUNT = 9': {'CUM_BASE_COL_COUNT = 9' in text_norm}")
print(f"  'Q_BASE_COL_COUNT = 7': {'Q_BASE_COL_COUNT = 7' in text_norm}")
print(f"  'seg-label-badge': {'seg-label-badge' in text_norm}")
print(f"  'segExtraWidth + kpiExtraWidth': {'segExtraWidth + kpiExtraWidth' in text_norm}")
print(f"  'colIdx === 4) return formatMillions(row.sgAndA)': {'colIdx === 4) return formatMillions(row.sgAndA)' in text_norm}")
print(f"  'segmentColumns.length * 2': {'segmentColumns.length * 2' in text_norm}")
print(f"  'c === 7 || c === 8': {'c === 7 || c === 8' in text_norm}")
