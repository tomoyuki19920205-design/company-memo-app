with open('components/FinancialsTable.tsx', 'r', encoding='utf-8', errors='replace') as f:
    lines = f.readlines()

changed = 0
out = []
for i, line in enumerate(lines):
    if 'pl-scroll-area' in line and 'maxHeight' in line:
        # style={{ maxHeight: plHeight }} を削除
        new_line = line.replace(' style={{ maxHeight: plHeight }}', '')
        print(f'L{i+1}: BEFORE: {line.rstrip()}')
        print(f'L{i+1}: AFTER:  {new_line.rstrip()}')
        out.append(new_line)
        changed += 1
    else:
        out.append(line)

with open('components/FinancialsTable.tsx', 'w', encoding='utf-8', errors='replace') as f:
    f.writelines(out)

print(f'Done. {changed} lines changed.')
