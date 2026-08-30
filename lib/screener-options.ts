export async function collectAllPages<T>(
    fetchPage: (from: number, to: number) => Promise<T[]>,
    pageSize = 1000,
): Promise<T[]> {
    const rows: T[] = [];
    for (let offset = 0; ; offset += pageSize) {
        const chunk = await fetchPage(offset, offset + pageSize - 1);
        rows.push(...chunk);
        if (chunk.length < pageSize) return rows;
    }
}

