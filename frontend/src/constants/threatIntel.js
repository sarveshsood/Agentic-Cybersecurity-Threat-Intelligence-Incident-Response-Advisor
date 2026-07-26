/**
 * Threat-intel / enrichment providers shown in Settings and the layout LIVE INTEL badge.
 * Keep in sync with backend GET /settings has_* flags (server.py).
 *
 * Cohere is listed under Threat intel in Settings (re-rank key) so it counts
 * toward the LIVE INTEL n/total badge — same 7 rows admins configure.
 */

/** @type {Array<[label: string, formField: string, hasFlag: string]>} */
export const TI_PROVIDERS = [
    ["AbuseIPDB", "abuseipdb_key", "has_abuseipdb"],
    ["VirusTotal", "virustotal_key", "has_virustotal"],
    ["GreyNoise", "greynoise_key", "has_greynoise"],
    ["ThreatFox", "threatfox_key", "has_threatfox"],
    ["AlienVault OTX", "otx_api_key", "has_otx"],
    ["Shodan", "shodan_api_key", "has_shodan"],
    ["Cohere Rerank", "cohere_api_key", "has_cohere"],
];

export const TI_FIELD_NAMES = TI_PROVIDERS.map(([, field]) => field);

export const TI_HAS_FLAGS = TI_PROVIDERS.map(([, , flag]) => flag);

/** Count configured providers from a GET /settings payload. */
export function countLiveIntel(settings) {
    const data = settings || {};
    return TI_HAS_FLAGS.filter((flag) => Boolean(data[flag])).length;
}

/** Labels of configured providers (for tooltips). */
export function liveIntelLabels(settings) {
    const data = settings || {};
    return TI_PROVIDERS.filter(([, , flag]) => data[flag]).map(([label]) => label);
}
