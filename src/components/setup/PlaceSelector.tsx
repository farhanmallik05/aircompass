"use client";

import { useState } from "react";
import { fmt, type Dictionary } from "@/lib/client/i18n";
import { isRecord, isValidPlace } from "@/lib/client/storage";
import type { GeoPlace, Profile } from "@/lib/types";

function PlaceResultsList({
  results,
  onPick,
}: {
  results: readonly GeoPlace[];
  onPick: (place: GeoPlace) => void;
}) {
  if (results.length === 0) return null;
  return (
    <ul className="divide-y divide-slate-200 rounded-lg border border-slate-300 dark:divide-slate-800 dark:border-slate-700">
      {results.map((r) => (
        <li key={`${r.lat}-${r.lon}-${r.name}`}>
          <button
            type="button"
            onClick={() => onPick(r)}
            className="min-h-11 w-full px-3 py-2 text-left text-sm hover:bg-teal-50 dark:hover:bg-slate-800"
          >
            {r.name}
            {r.admin1 ? `, ${r.admin1}` : ""} ({r.country})
          </button>
        </li>
      ))}
    </ul>
  );
}

function parseGeoPlace(item: unknown): GeoPlace | null {
  if (!isRecord(item)) return null;
  const admin1 = typeof item.admin1 === "string" ? item.admin1 : undefined;
  if (!isValidPlace(item)) return null;
  return {
    name: item.name,
    country: item.country,
    lat: item.lat,
    lon: item.lon,
    ...(admin1 ? { admin1 } : {}),
  };
}

async function queryRemotePlaces(
  query: string,
  dict: Dictionary,
): Promise<{ places: GeoPlace[]; status: string | null }> {
  try {
    const res = await fetch(`/api/context?q=${encodeURIComponent(query)}`);
    if (!res.ok) return { places: [], status: dict.setup.searchError };
    const raw: unknown = await res.json();
    if (!isRecord(raw) || !Array.isArray(raw.places)) {
      return { places: [], status: dict.setup.searchError };
    }
    const found = raw.places.map(parseGeoPlace).filter((p): p is GeoPlace => p !== null);
    return {
      places: found,
      status:
        found.length === 0
          ? dict.setup.searchEmpty
          : fmt(dict.setup.searchCount, { count: String(found.length) }),
    };
  } catch (err) {
    console.warn(
      "[PlaceSelector] queryRemotePlaces failed:",
      err instanceof Error ? err.message : String(err),
    );
    return { places: [], status: dict.setup.searchError };
  }
}

function PlaceSearchInputs({
  query,
  searching,
  dict,
  onQueryChange,
  onSearch,
  onGeolocate,
}: {
  query: string;
  searching: boolean;
  dict: Dictionary;
  onQueryChange: (q: string) => void;
  onSearch: () => void;
  onGeolocate: () => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      <input
        id="place-search"
        type="text"
        value={query}
        autoComplete="address-level2"
        placeholder={dict.setup.placeSearchPlaceholder}
        onChange={(e) => onQueryChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            onSearch();
          }
        }}
        className="min-h-11 flex-1 rounded-lg border border-slate-400 bg-white px-3 py-2 text-base text-slate-900 dark:border-slate-600 dark:bg-slate-950 dark:text-slate-100"
      />
      <button
        type="button"
        onClick={onSearch}
        disabled={searching}
        className="min-h-11 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700 disabled:opacity-50 dark:bg-slate-200 dark:text-slate-950"
      >
        {dict.setup.searchBtn}
      </button>
      <button
        type="button"
        onClick={onGeolocate}
        className="min-h-11 rounded-lg border border-slate-400 px-3 py-2 text-sm font-medium hover:bg-slate-100 dark:border-slate-600 dark:hover:bg-slate-800"
      >
        {dict.setup.useLocationBtn}
      </button>
    </div>
  );
}

/** Search city/neighbourhood selector with Open-Meteo geocoding and geolocation fallback feedback. */
export function PlaceSelector({
  place,
  dict,
  onSelectPlace,
}: {
  place: Profile["place"];
  dict: Dictionary;
  onSelectPlace: (nextPlace: Profile["place"]) => void;
}) {
  const [query, setQuery] = useState(place.name);
  const [results, setResults] = useState<GeoPlace[]>([]);
  const [searching, setSearching] = useState(false);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  async function handleSearch() {
    const clean = query.trim();
    if (!clean) return;
    setSearching(true);
    setStatusMsg(null);
    const out = await queryRemotePlaces(clean, dict);
    setResults(out.places);
    setStatusMsg(out.status);
    setSearching(false);
  }

  function handleGeolocate() {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setStatusMsg(dict.setup.geoError);
      return;
    }
    setStatusMsg(null);
    navigator.geolocation.getCurrentPosition(
      (pos) =>
        onSelectPlace({
          name: `${pos.coords.latitude.toFixed(2)}, ${pos.coords.longitude.toFixed(2)}`,
          lat: Number(pos.coords.latitude.toFixed(4)),
          lon: Number(pos.coords.longitude.toFixed(4)),
          country: place.country,
        }),
      () => setStatusMsg(dict.setup.geoError),
      { timeout: 8000 },
    );
  }

  return (
    <div className="space-y-2">
      <label htmlFor="place-search" className="block text-sm font-semibold">
        {dict.setup.placeSearchLabel}
      </label>
      <PlaceSearchInputs
        query={query}
        searching={searching}
        dict={dict}
        onQueryChange={setQuery}
        onSearch={handleSearch}
        onGeolocate={handleGeolocate}
      />
      <p className="text-sm text-slate-700 dark:text-slate-300">
        {fmt(dict.setup.selectedPlace, { name: place.name, country: place.country })}
      </p>
      {statusMsg ? (
        <p
          role="status"
          aria-live="polite"
          className="text-xs font-medium text-amber-800 dark:text-amber-300"
        >
          {statusMsg}
        </p>
      ) : null}
      <PlaceResultsList
        results={results}
        onPick={(r) => {
          onSelectPlace({ name: r.name, lat: r.lat, lon: r.lon, country: r.country });
          setQuery(r.name);
          setResults([]);
        }}
      />
    </div>
  );
}
