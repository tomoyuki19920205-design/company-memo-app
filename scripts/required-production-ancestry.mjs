import { execFileSync } from "node:child_process";

export const REQUIRED_PRODUCTION_ANCESTORS = Object.freeze([
    {
        feature: "actual / forecast separation",
        commit: "85ce5e50f39bcc2cd36f961b26a662ae6ac1580b",
    },
    {
        feature: "4331 fiscal-year transition fix",
        commit: "836fcb9af7da72ebc62856d1c6c87d8045ee6da6",
    },
    {
        feature: "5713 PBT display",
        commit: "ef05ac360ee90431c50cc005ba05bff200e5bf1d",
    },
    {
        feature: "structural-no-OP PBT display",
        commit: "08a03ad235aa3794cd39168b806671d3d96f6b71",
    },
    {
        feature: "financial IFRS PBT display",
        commit: "676b6e7e4fe4b7ed83380280dd5f365d0f291f5a",
    },
]);

function runGit(args) {
    return execFileSync("git", args, {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
    }).trim();
}

export function getCurrentHead(git = runGit) {
    return git(["rev-parse", "HEAD"]);
}

export function findMissingRequiredAncestors({
    head,
    requirements = REQUIRED_PRODUCTION_ANCESTORS,
    git = runGit,
}) {
    const missing = [];
    for (const requirement of requirements) {
        try {
            git(["merge-base", "--is-ancestor", requirement.commit, head]);
        } catch {
            missing.push(requirement);
        }
    }
    return missing;
}

export function formatMissingRequiredAncestors(missing) {
    return missing
        .map(({ feature, commit }) => `  - ${feature}: ${commit}`)
        .join("\n");
}

export function assertProductionRequiredAncestry({ git = runGit } = {}) {
    const head = getCurrentHead(git);
    const missing = findMissingRequiredAncestors({ head, git });
    if (missing.length > 0) {
        const error = new Error(
            `[STOP] Production deploy HEAD ${head} is missing required ancestors:\n` +
            formatMissingRequiredAncestors(missing),
        );
        error.code = "MISSING_REQUIRED_PRODUCTION_ANCESTORS";
        error.head = head;
        error.missing = missing;
        throw error;
    }
    return { head, requirements: REQUIRED_PRODUCTION_ANCESTORS };
}
