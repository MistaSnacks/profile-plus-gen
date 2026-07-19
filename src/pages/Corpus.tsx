import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Database, Sparkles, Quote, RotateCcw, X, Pencil, Check } from "lucide-react";
import { useEffect, useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { Navigation } from "@/components/Navigation";
import { useAuth } from "@/hooks/useAuth";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";

type Claim = {
  id: string;
  origin_document_id: string | null;
  kind: "verified" | "inferred" | "user_attested";
  type: "skill" | "achievement" | "scope" | "credential" | "role";
  text: string;
  labels: string[];
  reasoning: string | null;
  date_start: string | null;
  date_end: string | null;
  status: "active" | "rejected";
  claim_evidence: { id: string; quote: string; document_id: string }[];
};

const CLAIM_TYPE_ORDER = ["role", "achievement", "skill", "scope", "credential"] as const;

const Corpus = () => {
  const { toast } = useToast();
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");

  useEffect(() => {
    if (!loading && !user) {
      navigate("/auth");
    }
  }, [user, loading, navigate]);

  const { data: documents } = useQuery({
    queryKey: ["corpus-documents"],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("documents")
        .select("id, name")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const { data: claims } = useQuery({
    queryKey: ["claims"],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("claims")
        .select("*, claim_evidence(id, quote, document_id)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as Claim[];
    },
  });

  const extractMutation = useMutation({
    mutationFn: async (documentId: string) => {
      const { data, error } = await supabase.functions.invoke("extract-claims", {
        body: { documentId },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["claims"] });
      const s = data.summary;
      toast({
        title: "Claims extracted",
        description: `${s.verified} verified, ${s.inferred} inferred admitted — ${s.rejected} rejected by the evidence gate`,
      });
    },
    onError: (error) => {
      console.error("Extraction error:", error);
      toast({ title: "Extraction failed", description: String(error), variant: "destructive" });
    },
  });

  const statusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: "active" | "rejected" }) => {
      const { error } = await supabase.from("claims").update({ status }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["claims"] }),
  });

  // Editing changes only the claim's articulation; its evidence quote is immutable.
  const textMutation = useMutation({
    mutationFn: async ({ id, text }: { id: string; text: string }) => {
      const { error } = await supabase.from("claims").update({ text }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      setEditingId(null);
      queryClient.invalidateQueries({ queryKey: ["claims"] });
    },
  });

  const docName = (id: string | null) =>
    documents?.find((d) => d.id === id)?.name ?? "unknown document";

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-subtle flex items-center justify-center">
        <Sparkles className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) return null;

  return (
    <div className="min-h-screen bg-gradient-subtle">
      <Navigation />
      <div className="container mx-auto px-4 py-8">
        <motion.header
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="mb-8"
        >
          <h1 className="text-4xl font-bold text-foreground mb-2">Career Corpus</h1>
          <p className="text-muted-foreground">
            Every claim below is backed by evidence from your documents — nothing enters without a receipt
          </p>
        </motion.header>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="space-y-4">
            <Card className="p-6 bg-card shadow-soft">
              <h3 className="text-lg font-semibold text-foreground mb-4">Documents</h3>
              <div className="space-y-3">
                {documents?.length === 0 && (
                  <p className="text-sm text-muted-foreground">
                    Upload documents on the Documents page first.
                  </p>
                )}
                {documents?.map((doc) => (
                  <div key={doc.id} className="flex items-center justify-between gap-2">
                    <span className="text-sm text-foreground truncate">{doc.name}</span>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={extractMutation.isPending}
                      onClick={() => extractMutation.mutate(doc.id)}
                    >
                      <Database className="w-4 h-4 mr-1" />
                      {extractMutation.isPending ? "Extracting…" : "Extract claims"}
                    </Button>
                  </div>
                ))}
              </div>
            </Card>
          </div>

          <div className="lg:col-span-2 space-y-6">
            {CLAIM_TYPE_ORDER.map((type) => {
              const group = claims?.filter((c) => c.type === type) ?? [];
              if (group.length === 0) return null;
              return (
                <Card key={type} className="p-6 bg-card shadow-soft">
                  <h3 className="text-lg font-semibold text-foreground mb-4 capitalize">
                    {type}s <span className="text-muted-foreground text-sm">({group.length})</span>
                  </h3>
                  <div className="space-y-4">
                    {group.map((claim) => (
                      <div
                        key={claim.id}
                        className={`border border-border/40 rounded-lg p-4 ${
                          claim.status === "rejected" ? "opacity-50" : ""
                        }`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1">
                            {editingId === claim.id ? (
                              <div className="flex items-center gap-2">
                                <Input
                                  value={editText}
                                  onChange={(e) => setEditText(e.target.value)}
                                  className="text-sm"
                                />
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  disabled={editText.trim() === ""}
                                  onClick={() => textMutation.mutate({ id: claim.id, text: editText.trim() })}
                                >
                                  <Check className="w-4 h-4" />
                                </Button>
                              </div>
                            ) : (
                              <p className="text-sm text-foreground">{claim.text}</p>
                            )}
                            <div className="flex flex-wrap items-center gap-2 mt-2">
                              <Badge variant={claim.kind === "verified" ? "default" : "secondary"}>
                                {claim.kind}
                              </Badge>
                              {claim.date_start && (
                                <span className="text-xs text-muted-foreground">
                                  {claim.date_start}
                                  {claim.date_end ? ` – ${claim.date_end}` : ""}
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center">
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => {
                                setEditingId(editingId === claim.id ? null : claim.id);
                                setEditText(claim.text);
                              }}
                            >
                              <Pencil className="w-4 h-4" />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() =>
                                statusMutation.mutate({
                                  id: claim.id,
                                  status: claim.status === "active" ? "rejected" : "active",
                                })
                              }
                            >
                              {claim.status === "active" ? (
                                <X className="w-4 h-4" />
                              ) : (
                                <RotateCcw className="w-4 h-4" />
                              )}
                            </Button>
                          </div>
                        </div>
                        {claim.claim_evidence.map((ev) => (
                          <blockquote
                            key={ev.id}
                            className="mt-3 text-xs text-muted-foreground border-l-2 border-primary/40 pl-3"
                          >
                            <Quote className="w-3 h-3 inline mr-1" />
                            "{ev.quote}" — {docName(ev.document_id)}
                          </blockquote>
                        ))}
                        {claim.kind === "inferred" && claim.reasoning && (
                          <p className="mt-3 text-xs text-muted-foreground italic">
                            Inferred: {claim.reasoning}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                </Card>
              );
            })}
            {(claims?.length ?? 0) === 0 && (
              <Card className="p-6 bg-card shadow-soft">
                <p className="text-sm text-muted-foreground">
                  No claims yet. Pick a document on the left and extract claims from it.
                </p>
              </Card>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Corpus;
