import { createFileRoute, Link } from "@tanstack/react-router";
import {
  Building2, Landmark, MapPin, Navigation, Ruler, ShieldCheck,
} from "lucide-react";
import { PageShell } from "@/components/site-chrome";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/cdm-map")({
  head: () => ({
    meta: [
      {
        title: "Find Nearby CDMs — KryptoBazar",
        name: "description",
        content:
          "Verified cash deposit machines near you — bank name, address, distance and directions. KryptoBazar only lists machines verified by our team.",
      },
      { property: "og:title", content: "Find Nearby CDMs — KryptoBazar" },
      {
        property: "og:description",
        content:
          "Verified cash deposit machines near you — bank name, address, distance and directions.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: CdmMapPage,
});

function CdmMapPage() {
  return (
    <PageShell>
      <div className="mx-auto max-w-2xl">
        {/* Header */}
        <div className="mb-4">
          <h1 className="font-display text-xl font-bold tracking-tight md:text-2xl">
            Find Nearby CDMs
          </h1>
          <p className="text-xs text-muted-foreground">
            Verified cash deposit machines — for paying a seller without meeting in person.
          </p>
        </div>

        {/* How CDM payment works */}
        <div className="mb-3 rounded-2xl border border-border bg-card p-4 shadow-sm">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <Landmark className="h-4 w-4 text-primary" /> How CDM deposits work
          </div>
          <ol className="mt-2 space-y-1.5 text-xs text-muted-foreground">
            <li>1. Start a deal with a seller whose ad shows <span className="font-medium text-primary">CDM deposit</span>.</li>
            <li>2. In the Deal Room, copy the seller's bank details and deposit the exact INR amount at any CDM that accepts their bank.</li>
            <li>3. Upload the deposit receipt in the Deal Room chat.</li>
            <li>4. The seller verifies the actual bank credit, then escrow releases your USDT.</li>
          </ol>
        </div>

        {/* Directory state — verified data only, never fabricated */}
        <div className="rounded-2xl border border-dashed border-border bg-card p-6 text-center">
          <div className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-primary/10">
            <ShieldCheck className="h-6 w-6 text-primary" />
          </div>
          <h2 className="mt-3 font-display text-base font-semibold">
            No verified CDM directory is connected yet
          </h2>
          <p className="mx-auto mt-1 max-w-md text-xs leading-relaxed text-muted-foreground">
            KryptoBazar only shows machines that have been verified by our team.
            We never invent, auto-generate, or estimate machine locations — so
            the live map stays offline until a verified directory is available.
          </p>
          <div className="mt-4">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
              Once verified, each machine will show
            </div>
            <div className="mt-2 flex flex-wrap items-center justify-center gap-2">
              <Chip icon={Building2} label="Bank name" />
              <Chip icon={MapPin} label="Address" />
              <Chip icon={Ruler} label="Distance" />
              <Chip icon={Navigation} label="Directions" />
            </div>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
          <Link to="/marketplace">
            <Button variant="hero" size="sm">Browse CDM-enabled ads</Button>
          </Link>
        </div>
      </div>
    </PageShell>
  );
}

function Chip({ icon: Icon, label }: { icon: typeof MapPin; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-secondary/50 px-3 py-1 text-[11px] font-medium text-muted-foreground">
      <Icon className="h-3 w-3 text-primary" /> {label}
    </span>
  );
}
