export const NEWS_SPLIT_STORAGE_KEY = "company-viewer-news-split-ratio";
export const DEFAULT_NEWS_SPLIT_RATIO = 0.62;
export const NEWS_SPLITTER_WIDTH = 10;
export const NEWS_LEFT_MIN_WIDTH = 360;
export const NEWS_RIGHT_MIN_WIDTH = 380;
export const NEWS_RESIZE_STEP = 20;
export const NEWS_RESIZE_LARGE_STEP = 50;

export type NewsSplitBounds = {
    availableWidth: number;
    minRatio: number;
    maxRatio: number;
};

export function parseStoredNewsSplitRatio(value: string | null): number {
    if (value === null || value.trim() === "") return DEFAULT_NEWS_SPLIT_RATIO;
    const ratio = Number(value);
    return Number.isFinite(ratio) && ratio > 0 && ratio < 1
        ? ratio
        : DEFAULT_NEWS_SPLIT_RATIO;
}

export function getNewsSplitBounds(containerWidth: number): NewsSplitBounds {
    const availableWidth = Math.max(0, containerWidth - NEWS_SPLITTER_WIDTH);
    if (availableWidth === 0) {
        return { availableWidth, minRatio: 0, maxRatio: 1 };
    }

    const minRatio = NEWS_LEFT_MIN_WIDTH / availableWidth;
    const maxRatio = 1 - NEWS_RIGHT_MIN_WIDTH / availableWidth;
    if (minRatio > maxRatio) {
        const midpoint = NEWS_LEFT_MIN_WIDTH / (NEWS_LEFT_MIN_WIDTH + NEWS_RIGHT_MIN_WIDTH);
        return { availableWidth, minRatio: midpoint, maxRatio: midpoint };
    }
    return { availableWidth, minRatio, maxRatio };
}

export function clampNewsSplitRatio(ratio: number, containerWidth: number): number {
    const validRatio = Number.isFinite(ratio) ? ratio : DEFAULT_NEWS_SPLIT_RATIO;
    const { minRatio, maxRatio } = getNewsSplitBounds(containerWidth);
    return Math.min(maxRatio, Math.max(minRatio, validRatio));
}

export function newsSplitRatioFromPointer(clientX: number, containerLeft: number, containerWidth: number): number {
    const { availableWidth } = getNewsSplitBounds(containerWidth);
    if (availableWidth === 0) return DEFAULT_NEWS_SPLIT_RATIO;
    return clampNewsSplitRatio((clientX - containerLeft) / availableWidth, containerWidth);
}

export function resizeNewsSplitWithKeyboard(
    ratio: number,
    key: "ArrowLeft" | "ArrowRight",
    shiftKey: boolean,
    containerWidth: number,
): number {
    const { availableWidth } = getNewsSplitBounds(containerWidth);
    if (availableWidth === 0) return DEFAULT_NEWS_SPLIT_RATIO;
    const step = shiftKey ? NEWS_RESIZE_LARGE_STEP : NEWS_RESIZE_STEP;
    const direction = key === "ArrowLeft" ? -1 : 1;
    return clampNewsSplitRatio(ratio + direction * step / availableWidth, containerWidth);
}
