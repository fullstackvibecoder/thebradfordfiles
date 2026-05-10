import { datastoreSearch, resourceShow } from "../scripts/lib/ckan";
import { getDataFromCubePidCoordAndLatestNPeriods } from "../scripts/lib/statcan";

const TORONTO_CKAN = "ckan0.cf.opendata.inter.prod-toronto.ca";

export type CkanHost = typeof TORONTO_CKAN;

export type SourceKind = "ckan" | "statcan" | "url";

export interface FetchResult {
  value: string | number;
  as_of: string;
}

export interface NamedSource {
  kind: SourceKind;
  description: string;
  fetch: (params: Record<string, string | number>) => Promise<FetchResult>;
}

// `as_of` represents the date the metric was last retrieved (fetch date),
// not the CKAN resource's last_modified (which tracks file upload, not
// data coverage and is often misleadingly stale). Today's date is the
// honest answer to "when did we check."
function asOfToday(): string {
  return new Date().toISOString().slice(0, 10);
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
  // We touch resourceShow purely as a connectivity check.
  await resourceShow(TORONTO_CKAN, resource_id);
  return { value: search.total, as_of: asOfToday() };
}

// Helper: pick the StatCan WDS data point whose refPer starts with the given
// year prefix, for cubes that publish one annual value per year (frequency 12).
// Useful for indexes (e.g. Crime Severity Index) where the annual figure is
// the cube's native granularity, not a sum of months.
async function statcanLatestPointAnnual(
  productId: number,
  coordinate: string,
  params: Record<string, string | number>
): Promise<FetchResult> {
  const year = Number(params.year);
  if (!Number.isFinite(year)) {
    throw new Error("statcanLatestPointAnnual requires numeric year param");
  }
  // latestN=10 covers the most recent decade, enough to find any reasonable
  // request year while keeping the WDS payload small.
  const result = await getDataFromCubePidCoordAndLatestNPeriods(productId, coordinate, 10);
  const yearPrefix = String(year);
  const point = result.vectorDataPoint.find((p) => p.refPer.startsWith(yearPrefix));
  if (!point || point.value === null) {
    throw new Error("StatCan PID " + productId + " has no value for year " + year);
  }
  return { value: point.value, as_of: asOfToday() };
}

// Helper: sum every monthly data point whose refPer falls in the given year,
// for cubes that publish at monthly frequency (e.g. CMHC housing starts in
// PID 34100143). The annual figure is the sum of the 12 month values for
// that year. Throws if any month is null (incomplete year), so callers must
// fall back to a fully-published year.
async function statcanAnnualSumOfMonths(
  productId: number,
  coordinate: string,
  params: Record<string, string | number>
): Promise<FetchResult> {
  const year = Number(params.year);
  if (!Number.isFinite(year)) {
    throw new Error("statcanAnnualSumOfMonths requires numeric year param");
  }
  // latestN=36 covers the most recent three years of monthly data, enough to
  // find a full 12-month series for the target year while keeping the WDS
  // payload manageable.
  const result = await getDataFromCubePidCoordAndLatestNPeriods(productId, coordinate, 36);
  const yearPrefix = String(year);
  const monthsForYear = result.vectorDataPoint.filter((p) => p.refPer.startsWith(yearPrefix));
  if (monthsForYear.length === 0) {
    throw new Error("StatCan PID " + productId + " has no monthly data for year " + year);
  }
  if (monthsForYear.length < 12) {
    throw new Error(
      "StatCan PID " + productId + " has only " + monthsForYear.length +
      " of 12 months for year " + year
    );
  }
  let total = 0;
  for (const p of monthsForYear) {
    if (p.value === null) {
      throw new Error("StatCan PID " + productId + " has null month in year " + year + " (" + p.refPer + ")");
    }
    total += p.value;
  }
  return { value: total, as_of: asOfToday() };
}

export const NAMED_SOURCES: Record<string, NamedSource> = {
  // Theft from Motor Vehicle (TPS occurrence-level dataset, mirrored on
  // City of Toronto CKAN as a GeoJSON datastore resource).
  // Source page: https://open.toronto.ca/dataset/theft-from-motor-vehicle/
  // Original publisher: Toronto Police Service. Verified 2026-05-04.
  // Field: OCC_YEAR (numeric). Row id: EVENT_UNIQUE_ID.
  tps_auto_theft_annual: {
    kind: "ckan",
    description: "Toronto Police Service Theft from Motor Vehicle, annual occurrence count by OCC_YEAR",
    fetch: (params) => annualCountByOccYear("138efc01-91ca-4bfb-9e92-721e1477dc6a", params),
  },

  // Police Annual Statistical Report - Homicides
  // Source page: https://open.toronto.ca/dataset/police-annual-statistical-report-homicides/
  // Original publisher: Toronto Police Service. Verified 2026-05-04.
  // Field: OCC_YEAR. Row id: EVENT_UNIQUE_ID.
  tps_homicide_annual: {
    kind: "ckan",
    description: "Toronto Police Service Homicides, annual occurrence count by OCC_YEAR",
    fetch: (params) => annualCountByOccYear("559d4af8-ba23-44ed-916c-10efb6ed95ef", params),
  },

  // Shootings & Firearm Discharges
  // Source page: https://open.toronto.ca/dataset/shootings-firearm-discharges/
  // Original publisher: Toronto Police Service. Verified 2026-05-04.
  // Field: OCC_YEAR. Row id: EVENT_UNIQUE_ID.
  tps_shooting_annual: {
    kind: "ckan",
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
    kind: "ckan",
    description: "Toronto Police Service Bicycle Thefts, annual occurrence count by OCC_YEAR",
    fetch: (params) => annualCountByOccYear("34e4206d-549e-4957-a0da-093d703a1c62", params),
  },

  // City of Toronto Active Building Permits. The CKAN datastore resource
  // does not expose a numeric YEAR column, so we filter records by the
  // ISSUED_DATE prefix instead. Field name verified via datastore_search
  // limit=1 on 2026-05-04 (ISSUED_DATE, not PERMIT_ISSUE_DATE).
  // Source page: https://open.toronto.ca/dataset/building-permits-active-permits/
  toronto_building_permits_annual: {
    kind: "ckan",
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
      await resourceShow(TORONTO_CKAN, resource_id);
      return { value: filtered.length, as_of: asOfToday() };
    },
  },

  // Toronto CMA Crime Severity Index, total all violations.
  // Cube: Statistics Canada PID 35100026 ("Crime severity index and weighted
  // clearance rates, Canada, provinces, territories and Census Metropolitan
  // Areas"). Table: https://www150.statcan.gc.ca/t1/tbl1/en/tv.action?pid=3510002601
  // Coordinate verified 2026-05-04: "19.1.0.0.0.0.0.0.0.0" (Geography
  // dimension memberId=19 "Toronto, Ontario [35535]", Statistics dimension
  // memberId=1 "Crime severity index"). The cube's CSI measure already
  // represents total all violations; there is no separate violation-type
  // dimension. 2024 spot-check value: 59.35.
  statcan_csi_toronto_cma: {
    kind: "statcan",
    description: "Statistics Canada Crime Severity Index, Toronto CMA, total all violations",
    fetch: (params) => statcanLatestPointAnnual(35100026, "19.1.0.0.0.0.0.0.0.0", params),
  },

  // Canada national Crime Severity Index, total all violations.
  // Cube: Statistics Canada PID 35100026, same as Toronto entry above.
  // Coordinate verified 2026-05-04: "1.1.0.0.0.0.0.0.0.0" (Geography
  // dimension memberId=1 "Canada", Statistics dimension memberId=1 "Crime
  // severity index"). 2024 spot-check value: 77.89.
  statcan_csi_canada: {
    kind: "statcan",
    description: "Statistics Canada Crime Severity Index, Canada, total all violations",
    fetch: (params) => statcanLatestPointAnnual(35100026, "1.1.0.0.0.0.0.0.0.0", params),
  },

  // Toronto CMA total housing starts, all centres 10,000 and over.
  // Cube: Statistics Canada PID 34100143 ("CMHC, housing starts, under
  // construction and completions in centres 10,000 and over, Canada,
  // provinces, selected census metropolitan areas", monthly).
  // Table: https://www150.statcan.gc.ca/t1/tbl1/en/tv.action?pid=3410014301
  // Coordinate verified 2026-05-04: "13.1.1.0.0.0.0.0.0.0" (Geography
  // memberId=13 "Toronto, Ontario", Housing estimates memberId=1 "Housing
  // starts", Type of unit memberId=1 "Total units"). The annual cube
  // 34100134 has nulls for 2023 and 2024 at the time of verification, so we
  // sum the 12 monthly values from 34100143 instead. 2024 spot-check sum:
  // 37,718 starts.
  statcan_housing_starts_toronto_cma: {
    kind: "statcan",
    description: "Statistics Canada / CMHC Toronto CMA total housing starts, annual sum of monthly values",
    fetch: (params) => statcanAnnualSumOfMonths(34100143, "13.1.1.0.0.0.0.0.0.0", params),
  },

  // Toronto Public Health / Shelter system overdose surveillance.
  // Source page: https://open.toronto.ca/dataset/fatal-and-non-fatal-suspected-opioid-overdoses-in-the-shelter-system/
  // Original publisher: Shelter, Support and Housing Administration / Toronto
  // Public Health. Verified 2026-05-04. CKAN datastore_active resource id:
  // 5bd3540d-0974-44cd-ad24-d27a242c8643 ("summary-suspected-opioid-overdoses-
  // in-shelters"). Annual totals are stored as rows where year_stage="Total".
  // We sum suspected_non_fatal_overdoses_incidents across all such rows for
  // the requested year (the summary already pre-aggregates per year, so each
  // year has exactly one Total row). 2024 spot-check value: 555 non-fatal.
  // Substituted for the originally planned TPH overdose surveillance feed:
  // Toronto Public Health does not publish overdose deaths as a
  // machine-readable open dataset. The shelter-system overdose surveillance
  // dataset is the closest equivalent on Toronto's open data portal.
  tph_overdose_data: {
    kind: "ckan",
    description: "Toronto shelter system suspected opioid overdoses (non-fatal), annual total",
    fetch: async (params) => {
      const year = Number(params.year);
      if (!Number.isFinite(year)) {
        throw new Error("tph_overdose_data requires numeric year param");
      }
      const resource_id = "5bd3540d-0974-44cd-ad24-d27a242c8643";
      const search = await datastoreSearch(TORONTO_CKAN, resource_id, { year, year_stage: "Total" });
      if (search.records.length === 0) {
        throw new Error("No Total row for year " + year + " on resource " + resource_id);
      }
      let total = 0;
      for (const r of search.records) {
        const v = Number(r.suspected_non_fatal_overdoses_incidents);
        if (Number.isFinite(v)) total += v;
      }
      await resourceShow(TORONTO_CKAN, resource_id);
      return { value: total, as_of: asOfToday() };
    },
  },

  // TTC monthly ridership: NOT WIRED.
  // The Toronto CKAN package "ttc-monthly-ridership"
  // (https://open.toronto.ca/dataset/ttc-monthly-ridership/) lists a CSV
  // resource whose URL points to http://www.toronto.ca/progress (the Toronto
  // Progress Portal landing page), not a downloadable CSV. The same pattern
  // applies to ttc-ridership-revenues, ttc-average-weekday-ridership, and
  // ttc-annual-passenger-rides-peak-000s. The TTC CEO Reports publish
  // ridership in PDF only. Verified 2026-05-04. No machine-readable source
  // available, so this entry is intentionally omitted from NAMED_SOURCES.
  // Sprint 14 ships 4 new sources instead of 5 for this reason.
};

export function lookupSource(name: string): NamedSource | null {
  return NAMED_SOURCES[name] ?? null;
}
