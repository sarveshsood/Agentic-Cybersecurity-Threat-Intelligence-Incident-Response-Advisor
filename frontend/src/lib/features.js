/**
 * Product feature flags (H-07 / H-08) — SPA snapshot from GET /api/meta/features.
 *
 * Defaults are all false (flags off until env enables them). Load once at Layout
 * mount / after login; later collab UI gates on isFeatureEnabled().
 *
 * @see docs/product/COLLABORATION_AND_SAVED_FILTERS_DESIGN.md KD-9 / PR-1
 */
import {api} from "./api";

/** @type {Record<string, boolean>} */
export const FEATURE_DEFAULTS = Object.freeze({
    collab_assign: false,
    collab_comments: false,
    notification_center: false,
    saved_filters: false,
    pins: false,
});

/** @type {Record<string, boolean> | null} */
let cache = null;
/** @type {Promise<Record<string, boolean>> | null} */
let loadPromise = null;

/**
 * Last known snapshot (or safe defaults if never loaded).
 * @returns {Record<string, boolean>}
 */
export function getFeatures() {
    return cache ? {...cache} : {...FEATURE_DEFAULTS};
}

/**
 * @param {string} key
 * @returns {boolean}
 */
export function isFeatureEnabled(key) {
    const snap = cache || FEATURE_DEFAULTS;
    return Boolean(snap[key]);
}

/**
 * Fetch /meta/features once (deduped). On network error, keep defaults (all off).
 * @param {{ force?: boolean }} [opts]
 * @returns {Promise<Record<string, boolean>>}
 */
export async function loadFeatures(opts = {}) {
    const force = Boolean(opts.force);
    if (cache && !force) {
        return getFeatures();
    }
    if (loadPromise && !force) {
        return loadPromise;
    }

    loadPromise = api
        .get("/meta/features")
        .then((r) => {
            const data = r?.data && typeof r.data === "object" ? r.data : {};
            cache = {...FEATURE_DEFAULTS};
            for (const key of Object.keys(FEATURE_DEFAULTS)) {
                if (typeof data[key] === "boolean") {
                    cache[key] = data[key];
                }
            }
            return getFeatures();
        })
        .catch(() => {
            if (!cache) {
                cache = {...FEATURE_DEFAULTS};
            }
            return getFeatures();
        })
        .finally(() => {
            loadPromise = null;
        });

    return loadPromise;
}

/** Test helper — clear in-memory cache. */
export function _resetFeaturesCache() {
    cache = null;
    loadPromise = null;
}
