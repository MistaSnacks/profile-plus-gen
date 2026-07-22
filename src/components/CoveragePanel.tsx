import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, Lightbulb, CircleSlash, Route } from "lucide-react";

export interface CoverageRow {
  requirementId: string;
  text: string;
  type: string;
  priority: string;
  status: "verified" | "inferred" | "gap";
  claimIds: string[];
  rationale: string | null;
}

export interface LaneInfo {
  selected: { name: string; claimIds: string[] };
  rationale: string;
  competing: { name: string; claimIds: string[] }[];
  laneFallback?: boolean;
}

export interface CoverageSummary {
  requirements: number;
  verified: number;
  inferred: number;
  gaps: number;
}

const STATUS_META = {
  verified: { label: "Verified", icon: CheckCircle2, className: "text-success" },
  inferred: { label: "Inferred", icon: Lightbulb, className: "text-warning" },
  gap: { label: "Gap", icon: CircleSlash, className: "text-muted-foreground" },
} as const;

export const CoveragePanel = ({
  coverage,
  lane,
  summary,
}: {
  coverage: CoverageRow[];
  lane: LaneInfo;
  summary: CoverageSummary;
}) => {
  return (
    <Card className="p-6 bg-card shadow-soft">
      <div className="flex items-start gap-3 mb-4">
        <Route className="w-5 h-5 text-primary mt-0.5 flex-shrink-0" />
        <div>
          <h3 className="text-lg font-semibold text-foreground">
            {lane.selected.name}
            {lane.laneFallback && (
              <span className="ml-2 text-xs text-muted-foreground">(no distinct lane found)</span>
            )}
          </h3>
          {lane.rationale && <p className="text-sm text-muted-foreground">{lane.rationale}</p>}
          {lane.competing.length > 0 && (
            <p className="text-xs text-muted-foreground mt-1">
              Not chosen: {lane.competing.map((c) => c.name).join(", ")}
            </p>
          )}
        </div>
      </div>

      <div className="flex flex-wrap gap-2 mb-4">
        <Badge variant="default">{summary.verified} verified</Badge>
        <Badge variant="secondary">{summary.inferred} inferred</Badge>
        <Badge variant="outline">{summary.gaps} gaps</Badge>
        <span className="text-xs text-muted-foreground self-center">
          of {summary.requirements} requirements
        </span>
      </div>

      <div className="space-y-2">
        {coverage.map((row) => {
          const meta = STATUS_META[row.status];
          const Icon = meta.icon;
          return (
            <div key={row.requirementId} className="flex items-start gap-2 border-b border-border/40 pb-2">
              <Icon className={`w-4 h-4 mt-0.5 flex-shrink-0 ${meta.className}`} />
              <div className="flex-1">
                <p className="text-sm text-foreground">{row.text}</p>
                <div className="flex flex-wrap items-center gap-2 mt-1">
                  <span className="text-xs text-muted-foreground">
                    {row.priority} · {row.type} · {meta.label}
                    {row.claimIds.length > 0 && ` · ${row.claimIds.length} claim${row.claimIds.length === 1 ? "" : "s"}`}
                  </span>
                </div>
                {row.rationale && (
                  <p className="text-xs text-muted-foreground italic mt-1">{row.rationale}</p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
};
