import { datastoreSearch, resourceShow } from "../scripts/lib/ckan";

// All five launch sources resolve to the City of Toronto CKAN portal
// (host: ckan0.cf.opendata.inter.prod-toronto.ca). The Toronto Police
// Service public portal at data.torontopolice.on.ca is an ArcGIS Hub
// site, not a CKAN endpoint, so the canonical TPS open datasets are
// consumed via the City of Toronto CKAN mirror. Per-entry comments
// link back to the original publisher's catalogue page.
const TORONTO_CKAN = "ckan0.cf.opendata.inter.prod-toronto.ca";

export type CkanHost = typeof TORONTO_CKAN;

export interface FetchResult {
  value: string | number;
  as_of: string;
}

export interface NamedSource {
  domain: CkanHost;
  resource_id: string;
  description: string;
  fetch: (params: Record<string, string | number>) => Promise<FetchResult>;
}

function asOfFromMeta(meta: { last_modified: string | null; created: string }): string {
  const raw = meta.last_modified ?? meta.created;
  return raw.slice(0, 10);
}

// Helper: count rows for a given year on a TPS-style resource. Each row is
// one occurrence (one EVENT_UNIQUE_ID), so the annual count is the total
// returned by datastore_search filtered by OCC_YEAR.
async function annualCountByOccYear(
  resource_id: string,
  params: Record<string, string | number>
): Promise<FetchResult> {
  const year = Number(params.year);
  if (!Number.isFinite(year)) {
    throw new Error("annualCountByOccYear requires numeric year param");
  }
  const search = await datastoreSearch(TORONTO_CKAN, resource_id, { OCC_YEAR: year });
  if (search.records.length === 0) {
    throw new Error("No records returned for year " + year + " on resource " + resource_id);
  }
  const meta = await resourceShow(TORONTO_CKAN, resource_id);
  return { value: search.total, as_of: asOfFromMeta(meta) };
}

export const NAMED_SOURCES: Record<string, NamedSource> = {
  // Theft from Motor Vehicle (TPS occurrence-level dataset, mirrored on
  // City of Toronto CKAN as a GeoJSON datastore resource).
  // Source page: https://open.toronto.ca/dataset/theft-from-motor-vehicle/
  // Original publisher: Toronto Police Service. Verified 2026-05-04.
  // Field: OCC_YEAR (numeric). Row id: EVENT_UNIQUE_ID.
  tps_auto_theft_annual: {
    domain: TORONTO_CKAN,
    resource_id: "138efc01-91ca-4bfb-9e92-721e1477dc6a",
    description: "Toronto Police Service Theft from Motor Vehicle, annual occurrence count by OCC_YEAR",
    fetch: (params) => annualCountByOccYear("138efc01-91ca-4bfb-9e92-721e1477dc6a", params),
  },

  // Police Annual Statistical Report - Homicides (TPS occurrence-level
  // dataset, GeoJSON datastore resource on City of Toronto CKAN).
  // Source page: https://open.toronto.ca/dataset/police-annual-statistical-report-homicides/
  // Original publisher: Toronto Police Service. Verified 2026-05-04.
  // Field: OCC_YEAR. Row id: EVENT_UNIQUE_ID.
  tps_homicide_annual: {
    domain: TORONTO_CKAN,
    resource_id: "559d4af8-ba23-44ed-916c-10efb6ed95ef",
    description: "Toronto Police Service Homicides, annual occurrence count by OCC_YEAR",
    fetch: (params) => annualCountByOccYear("559d4af8-ba23-44ed-916c-10efb6ed95ef", params),
  },

  // Shootings & Firearm Discharges (TPS occurrence-level dataset, GeoJSON
  // datastore resource on City of Toronto CKAN).
  // Source page: https://open.toronto.ca/dataset/shootings-firearm-discharges/
  // Original publisher: Toronto Police Service. Verified 2026-05-04.
  // Field: OCC_YEAR. Row id: EVENT_UNIQUE_ID.
  tps_shooting_annual: {
    domain: TORONTO_CKAN,
    resource_id: "6ab1ffae-a6ef-4d39-b943-4f6670fe58fa",
    description: "Toronto Police Service Shootings and Firearm Discharges, annual occurrence count by OCC_YEAR",
    fetch: (params) => annualCountByOccYear("6ab1ffae-a6ef-4d39-b943-4f6670fe58fa", params),
  },

  // Bicycle Thefts (TPS occurrence-level dataset, GeoJSON datastore
  // resource on City of Toronto CKAN). Substituted for the originally
  // planned Major Crime Indicators feed: at verification time the
  // Community Safety Indicators package on CKAN no longer exposes a
  // datastore_active resource named "Major Crime Indicators" with
  // occurrence-level rows. Bicycle Thefts is a TPS occurrence-level
  // MCI-class dataset and fits the same fetch pattern.
  // Source page: https://open.toronto.ca/dataset/bicycle-thefts/
  // Original publisher: Toronto Police Service. Verified 2026-05-04.
  // Field: OCC_YEAR. Row id: EVENT_UNIQUE_ID.
  tps_bicycle_theft_annual: {
    domain: TORONTO_CKAN,
    resource_id: "34e4206d-549e-4957-a0da-093d703a1c62",
    description: "Toronto Police Service Bicycle Thefts, annual occurrence count by OCC_YEAR",
    fetch: (params) => annualCountByOccYear("34e4206d-549e-4957-a0da-093d703a1c62", params),
  },

  // City of Toronto Active Building Permits. The CKAN datastore resource
  // does not expose a numeric YEAR column, so we filter records by the
  // ISSUED_DATE prefix instead. Field name verified via datastore_search
  // limit=1 on 2026-05-04 (ISSUED_DATE, not PERMIT_ISSUE_DATE).
  // Source page: https://open.toronto.ca/dataset/building-permits-active-permits/
  toronto_building_permits_annual: {
    domain: TORONTO_CKAN,
    resource_id: "6d0229af-bc54-46de-9c2b-26759b01dd05",
    description: "City of Toronto Active Building Permits, annual count by ISSUED_DATE year prefix",
    fetch: async (params) => {
      const year = Number(params.year);
      if (!Number.isFinite(year)) {
        throw new Error("toronto_building_permits_annual requires numeric year param");
      }
      const resource_id = "6d0229af-bc54-46de-9c2b-26759b01dd05";
      const search = await datastoreSearch(TORONTO_CKAN, resource_id, null);
      const yearPrefix = String(year);
      const filtered = search.records.filter((r) => {
        const issued = r.ISSUED_DATE;
        if (typeof issued !== "string") return false;
        return issued.startsWith(yearPrefix);
      });
      const meta = await resourceShow(TORONTO_CKAN, resource_id);
      return { value: filtered.length, as_of: asOfFromMeta(meta) };
    },
  },
};

export function lookupSource(name: string): NamedSource | null {
  return NAMED_SOURCES[name] ?? null;
}
