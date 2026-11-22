import { useEffect, useRef, useState } from "react";
import "leaflet/dist/leaflet.css";
import type { Map as LeafletMap } from "leaflet";

type CdmMapCanvasProps = {
  latitude: number;
  longitude: number;
};

export function CdmMapCanvas({ latitude, longitude }: CdmMapCanvasProps) {
  const mapElement = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<LeafletMap | null>(null);
  const [mapFailed, setMapFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let createdMap: LeafletMap | null = null;

    const createMap = async () => {
      try {
        const leaflet = await import("leaflet");
        if (cancelled || !mapElement.current) return;

        const map = leaflet.default.map(mapElement.current, {
          center: [latitude, longitude],
          zoom: 14,
          scrollWheelZoom: false,
          zoomControl: true,
        });
        createdMap = map;
        mapInstance.current = map;

        leaflet.default
          .tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
            maxZoom: 19,
            attribution:
              '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
          })
          .addTo(map);

        leaflet.default
          .circleMarker([latitude, longitude], {
            radius: 8,
            color: "var(--primary)",
            fillColor: "var(--primary)",
            fillOpacity: 0.85,
            weight: 3,
          })
          .bindPopup("Your location")
          .addTo(map);

        window.requestAnimationFrame(() => map.invalidateSize());
      } catch {
        if (!cancelled) setMapFailed(true);
      }
    };

    void createMap();

    return () => {
      cancelled = true;
      createdMap?.remove();
      if (mapInstance.current === createdMap) mapInstance.current = null;
    };
  }, []);

  useEffect(() => {
    mapInstance.current?.setView([latitude, longitude], 14);
  }, [latitude, longitude]);

  return (
    <div className="relative overflow-hidden rounded-xl border border-border bg-secondary">
      <div
        ref={mapElement}
        className="h-[360px] w-full md:h-[460px]"
        role="application"
        aria-label="Map centered on your location"
      />
      {mapFailed && (
        <div className="absolute inset-0 grid place-items-center bg-background/90 p-6 text-center text-sm text-muted-foreground">
          The map couldn’t load. Check your connection and try again.
        </div>
      )}
    </div>
  );
}