import { createFileRoute, Link } from "@tanstack/react-router";
import { lazy, Suspense, useState } from "react";
import {
  ArrowUpRight,
  Landmark,
  LocateFixed,
  LoaderCircle,
  MapPin,
  ShieldCheck,
} from "lucide-react";
import { PageShell } from "@/components/site-chrome";
import { Button } from "@/components/ui/button";

const LazyCdmMapCanvas = lazy(() =>
  import("@/components/cdm-map-canvas").then((module) => ({
    default: module.CdmMapCanvas,
  })),
);

type UserLocation = { latitude: number; longitude: number };

export const Route = createFileRoute("/cdm-map")({
  head: () => ({
    meta: [
      {
        title: "Find Nearby CDMs — KryptoBazar",
        name: "description",
        content:
          "Explore your area on the KryptoBazar CDM map. Only verified cash deposit machine locations will be shown.",
      },
      { property: "og:title", content: "Find Nearby CDMs — KryptoBazar" },
      {
        property: "og:description",
        content:
          "Explore your area on the KryptoBazar CDM map. Only verified cash deposit machine locations will be shown.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: CdmMapPage,
});

function CdmMapPage() {
  const [location, setLocation] = useState<UserLocation | null>(null);
  const [locating, setLocating] = useState(false);
  const [locationError, setLocationError] = useState("");

  const locateMe = () => {
    setLocationError("");
    if (!navigator.geolocation) {
      setLocationError("Location access isn’t available in this browser.");
      return;
    }

    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        setLocation({ latitude: coords.latitude, longitude: coords.longitude });
        setLocating(false);
      },
      (error) => {
        setLocationError(
          error.code === error.PERMISSION_DENIED
            ? "Location access is off. Allow it in your browser settings to center the map near you."
            : "We couldn’t determine your location. Please try again.",
        );
        setLocating(false);
      },
      { enableHighAccuracy: false, maximumAge: 300_000, timeout: 15_000 },
    );
  };

  return (
    <PageShell>
      <div className="mx-auto max-w-4xl">
        <div className="mb-4 flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
          <div>
            <div className="mb-1 flex items-center gap-2 text-xs font-medium text-primary">
              <Landmark className="h-4 w-4" /> Cash deposit machines
            </div>
            <h1 className="font-display text-xl font-bold md:text-2xl">
              Find Nearby CDMs
            </h1>
            <p className="mt-1 text-xs text-muted-foreground">
              Explore your area. Verified machines only.
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={locateMe}
            disabled={locating}
            className="min-h-10 self-start sm:self-auto"
          >
            {locating ? (
              <LoaderCircle className="h-4 w-4 animate-spin" />
            ) : (
              <LocateFixed className="h-4 w-4" />
            )}
            {location ? "Update location" : "Use my location"}
          </Button>
        </div>

        {locationError && (
          <p
            role="alert"
            className="mb-3 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive"
          >
            {locationError}
          </p>
        )}

        {location ? (
          <Suspense
            fallback={
              <div className="grid h-[360px] place-items-center rounded-xl border border-border bg-secondary text-sm text-muted-foreground md:h-[460px]">
                Loading map…
              </div>
            }
          >
            <LazyCdmMapCanvas
              latitude={location.latitude}
              longitude={location.longitude}
            />
          </Suspense>
        ) : (
          <div className="flex min-h-[320px] flex-col items-center justify-center rounded-xl border border-border bg-card px-5 py-8 text-center shadow-sm">
            <div className="grid h-12 w-12 place-items-center rounded-full bg-primary/10 text-primary">
              <MapPin className="h-6 w-6" />
            </div>
            <h2 className="mt-3 font-display text-base font-semibold">
              Start with your area
            </h2>
            <p className="mt-1 max-w-sm text-xs leading-relaxed text-muted-foreground">
              Share your location to open the map centered near you. Your
              location is used only for this view.
            </p>
            <Button
              type="button"
              variant="hero"
              size="sm"
              onClick={locateMe}
              disabled={locating}
              className="mt-4 min-h-10"
            >
              {locating ? (
                <LoaderCircle className="h-4 w-4 animate-spin" />
              ) : (
                <LocateFixed className="h-4 w-4" />
              )}
              Use my location
            </Button>
          </div>
        )}

        <section className="mt-3 rounded-xl border border-warning/30 bg-warning/5 p-4">
          <div className="flex items-start gap-3">
            <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-warning" />
            <div>
              <h2 className="text-sm font-semibold">No verified CDMs listed yet</h2>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                We don’t have a verified machine directory to show nearby
                locations, bank names, distances, or directions. No locations
                are estimated or added without verification, and CDM deals
                remain unavailable until verified data is connected.
              </p>
            </div>
          </div>
        </section>

        <section className="mt-5 border-t border-border pt-4">
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <Landmark className="h-4 w-4 text-primary" /> How CDM payments work
          </h2>
          <ol className="mt-2 grid gap-2 text-xs leading-relaxed text-muted-foreground sm:grid-cols-2">
            <li>1. Choose an ad that supports CDM payment.</li>
            <li>2. Deposit the exact INR amount into the seller’s bank.</li>
            <li>3. Upload your deposit receipt in the Deal Room chat.</li>
            <li>
              4. The seller checks the actual bank credit before releasing USDT.
            </li>
          </ol>
          <p className="mt-3 rounded-lg bg-secondary px-3 py-2 text-xs font-medium text-foreground">
            A receipt alone does not prove payment. Never release escrow until
            the bank credit is independently confirmed.
          </p>
        </section>

        <div className="mt-4 flex justify-center">
          <Link to="/marketplace">
            <Button variant="outline" size="sm">
              Back to marketplace <ArrowUpRight className="h-3.5 w-3.5" />
            </Button>
          </Link>
        </div>
      </div>
    </PageShell>
  );
}