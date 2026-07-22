import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Loader2 } from "lucide-react";

interface Bullet {
  id: string;
  section: string;
  position: number;
  text: string;
  created_at: string;
}

export const V2ResumeContent = ({
  resumeId,
  fallbackContent,
}: {
  resumeId: string;
  fallbackContent: string;
}) => {
  const { data: bullets, isLoading } = useQuery({
    queryKey: ["resume-bullets", resumeId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("resume_bullets")
        .select("id, section, position, text, created_at")
        .eq("resume_id", resumeId)
        .order("position", { ascending: true })
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data as Bullet[];
    },
  });

  if (isLoading) {
    return <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />;
  }

  // A v2 resume with no bullet rows means its claims were re-extracted out from
  // under it; the stored text is still the honest record of what was generated.
  if (!bullets || bullets.length === 0) {
    return <pre className="whitespace-pre-wrap font-sans text-xs text-foreground">{fallbackContent}</pre>;
  }

  const sections: string[] = [];
  const bySection = new Map<string, Bullet[]>();
  for (const b of bullets) {
    if (!bySection.has(b.section)) {
      bySection.set(b.section, []);
      sections.push(b.section);
    }
    bySection.get(b.section)!.push(b);
  }

  return (
    <div className="text-xs text-foreground space-y-4">
      {sections.map((section) => (
        <div key={section}>
          <h4 className="font-semibold uppercase tracking-wide text-foreground mb-1">{section}</h4>
          <ul className="space-y-1">
            {bySection
              .get(section)!
              .slice()
              .sort((a, b) => a.position - b.position)
              .map((b) => (
                <li key={b.id} className="flex items-start gap-2">
                  <span className="w-1 h-1 rounded-full bg-primary mt-1.5 flex-shrink-0" />
                  <span>{b.text}</span>
                </li>
              ))}
          </ul>
        </div>
      ))}
    </div>
  );
};
