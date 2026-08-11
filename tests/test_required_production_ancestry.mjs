import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import {
    REQUIRED_PRODUCTION_ANCESTORS,
    assertProductionRequiredAncestry,
    findMissingRequiredAncestors,
    formatMissingRequiredAncestors,
} from "../scripts/required-production-ancestry.mjs";

test("required production lineage names every protected Viewer feature", () => {
    assert.deepEqual(
        REQUIRED_PRODUCTION_ANCESTORS.map(({ feature }) => feature),
        [
            "actual / forecast separation",
            "4331 fiscal-year transition fix",
            "5713 PBT display",
            "structural-no-OP PBT display",
            "financial IFRS PBT display",
        ],
    );
    assert.ok(REQUIRED_PRODUCTION_ANCESTORS.every(({ commit }) => /^[0-9a-f]{40}$/.test(commit)));
});

test("guard checks every required commit against the resolved current HEAD", () => {
    const calls = [];
    const git = (args) => {
        calls.push(args);
        return args[0] === "rev-parse" ? "current-head" : "";
    };

    const result = assertProductionRequiredAncestry({ git });

    assert.equal(result.head, "current-head");
    assert.deepEqual(calls[0], ["rev-parse", "HEAD"]);
    assert.deepEqual(
        calls.slice(1),
        REQUIRED_PRODUCTION_ANCESTORS.map(({ commit }) => [
            "merge-base",
            "--is-ancestor",
            commit,
            "current-head",
        ]),
    );
});

test("guard reports every missing required ancestor and refuses the deploy", () => {
    const missingCommits = new Set([
        REQUIRED_PRODUCTION_ANCESTORS[0].commit,
        REQUIRED_PRODUCTION_ANCESTORS[2].commit,
    ]);
    const git = (args) => {
        if (args[0] === "rev-parse") return "rollback-head";
        if (missingCommits.has(args[2])) throw new Error("not an ancestor");
        return "";
    };

    assert.throws(
        () => assertProductionRequiredAncestry({ git }),
        (error) => {
            assert.equal(error.code, "MISSING_REQUIRED_PRODUCTION_ANCESTORS");
            assert.equal(error.head, "rollback-head");
            assert.deepEqual(error.missing, [
                REQUIRED_PRODUCTION_ANCESTORS[0],
                REQUIRED_PRODUCTION_ANCESTORS[2],
            ]);
            assert.match(error.message, /actual \/ forecast separation/);
            assert.match(error.message, /5713 PBT display/);
            return true;
        },
    );
});

test("missing ancestor formatter emits an explicit STOP-ready list", () => {
    const missing = findMissingRequiredAncestors({
        head: "old-head",
        requirements: REQUIRED_PRODUCTION_ANCESTORS.slice(3),
        git: () => { throw new Error("not an ancestor"); },
    });
    const message = formatMissingRequiredAncestors(missing);
    assert.match(message, /structural-no-OP PBT display: [0-9a-f]{40}/);
    assert.match(message, /financial IFRS PBT display: [0-9a-f]{40}/);
});

test("only the production npm workflow invokes the deploy guard", () => {
    const packageJson = JSON.parse(fs.readFileSync(new URL("../package.json", import.meta.url)));
    assert.match(packageJson.scripts["deploy:prod"], /^node scripts\/check-deploy\.mjs && vercel --prod$/);
    assert.equal(packageJson.scripts["dev"].includes("check-deploy"), false);
    assert.equal(packageJson.scripts["build"].includes("check-deploy"), false);
});
