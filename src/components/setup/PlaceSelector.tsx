"use client";

import { useState } from "react";
import type { Dictionary } from "@/lib/client/i18n";
import { fmt } from "@/lib/client/i18n";
import type { GeoPlace, Profile } from "@/lib/types";

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
    if (!query.trim()) return;
    setSearching(true);
    setStatusMsg(null);
    try {
      const res = await fetch(`/api/context?q=${encodeURIComponent(query.trim())}`);
      if (!res.ok) {
        setStatusMsg(dict.setup.searchError);
        return;
      }
      const data = (await res.json()) as { places?: GeoPlace[] };
      const found = data.places ?? [];
      setResults(found);
      if (found.length === 0) setStatusMsg(dict.setup.searchEmpty);
    } catch {
      setStatusMsg(dict.setup.searchError);
    } finally {
      setSearching(false);
    }
  }

  function handleGeolocate() {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setStatusMsg(dict.setup.geoError);
      return;
    }
    setStatusMsg(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        onSelectPlace({
          name: `${pos.coords.latitude.toFixed(2)}, ${pos.coords.longitude.toFixed(2)}`,
          lat: Number(pos.coords.latitude.toFixed(4)),
          lon: Number(pos.coords.longitude.toFixed(4)),
          country: place.country,
        });
      },
      () => {
        setStatusMsg(dict.setup.geoError);
      },
      { timeout: 8000 },
    );
  }

  return (
    <div className="space-y-2">
      <label htmlFor="place-search" className="block text-sm font-semibold">
        {dict.setup.placeSearchLabel}
      </label>
      <div className="flex flex-wrap gap-2">
        <input
          id="place-search"
          type="text"
          value={query}
          autoComplete="address-level2"
          placeholder={dict.setup.placeSearchPlaceholder}
          onChange={(e) => setQuery(e.target.value)}
          className="min-h-11 flex-1 rounded-lg border border-slate-400 bg-white px-3 py-2 text-base text-slate-900 dark:border-slate-600 dark:bg-slate-950 dark:text-slate-100"
        />
        <button
          type="button"
          onClick={handleSearch}
          disabled={searching}
          className="min-h-11 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700 disabled:opacity-50 dark:bg-slate-200 dark:text-slate-950"
        >
          {dict.setup.searchBtn}
        </button>
        <button
          type="button"
          onClick={handleGeolocate}
          className="min-h-11 rounded-lg border border-slate-400 px-3 py-2 text-sm font-medium hover:bg-slate-100 dark:border-slate-600 dark:hover:bg-slate-800"
        >
          {dict.setup.useLocationBtn}
        </button>
      </div>
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
      {results.length > 0 ? (
        <ul className="divide-y divide-slate-200 rounded-lg border border-slate-300 dark:divide-slate-800 dark:border-slate-700">
          {results.map((r) => (
            <li key={`${r.lat}-${r.lon}-${r.name}`}>
              <button
                type="button"
                onClick={() => {
                  onSelectPlace({ name: r.name, lat: r.lat, lon: r.lon, country: r.country });
                  setQuery(r.name);
                  setResults([]);
                }}
                className="min-h-11 w-full px-3 py-2 text-left text-sm hover:bg-teal-50 dark:hover:bg-slate-800"
              >
                {r.name}
                {r.admin1 ? `, ${r.admin1}` : ""} ({r.country})
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
