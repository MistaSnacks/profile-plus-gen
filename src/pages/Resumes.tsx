import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { FileText, TrendingUp, Download, Eye, Loader2, Sparkles } from "lucide-react";
import { Navigation } from "@/components/Navigation";
import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface Resume {
  id: string;
  title: string;
  ats_score: number;
  created_at: string;
  content: string;
}

const Resumes = () => {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [resumes, setResumes] = useState<Resume[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!loading && !user) {
      navigate("/auth");
      return;
    }
    if (user) {
      fetchResumes();
    }
  }, [user, loading, navigate]);

  const fetchResumes = async () => {
    try {
      const { data, error } = await supabase
        .from("generated_resumes")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;
      setResumes(data || []);
    } catch (error) {
      console.error("Error fetching resumes:", error);
      toast({
        title: "Error",
        description: "Failed to load resumes",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return "Today";
    if (diffDays === 1) return "Yesterday";
    if (diffDays < 7) return `${diffDays} days ago`;
    if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
    return date.toLocaleDateString();
  };

  const getScoreStatus = (score: number) => {
    if (score >= 90) return "high";
    if (score >= 75) return "medium";
    return "low";
  };

  const avgScore = resumes.length > 0
    ? Math.round(resumes.reduce((sum, r) => sum + (r.ats_score || 0), 0) / resumes.length)
    : 0;

  const thisMonth = resumes.filter(r => {
    const date = new Date(r.created_at);
    const now = new Date();
    return date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear();
  }).length;

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-subtle flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) return null;

  return (
    <div className="min-h-screen bg-gradient-subtle">
      <Navigation />
      <div className="container mx-auto px-4 py-8">
        <header className="mb-8">
          <h1 className="text-4xl font-bold text-foreground mb-2">My Resumes</h1>
          <p className="text-muted-foreground">View and manage all your generated resumes</p>
        </header>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <Card className="p-4 bg-gradient-card shadow-soft">
            <p className="text-sm text-muted-foreground mb-1">Total Resumes</p>
            <p className="text-3xl font-bold text-foreground">{resumes.length}</p>
          </Card>
          <Card className="p-4 bg-gradient-card shadow-soft">
            <p className="text-sm text-muted-foreground mb-1">Avg Score</p>
            <p className="text-3xl font-bold text-success">{avgScore}%</p>
          </Card>
          <Card className="p-4 bg-gradient-card shadow-soft">
            <p className="text-sm text-muted-foreground mb-1">This Month</p>
            <p className="text-3xl font-bold text-foreground">{thisMonth}</p>
          </Card>
          <Card className="p-4 bg-gradient-card shadow-soft">
            <p className="text-sm text-muted-foreground mb-1">Downloaded</p>
            <p className="text-3xl font-bold text-foreground">0</p>
          </Card>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        ) : resumes.length === 0 ? (
          <Card className="p-12 bg-card shadow-soft text-center">
            <FileText className="w-12 h-12 mx-auto mb-4 text-muted-foreground opacity-50" />
            <h3 className="text-lg font-semibold text-foreground mb-2">No resumes yet</h3>
            <p className="text-muted-foreground mb-4">Generate your first resume to get started</p>
            <Button onClick={() => navigate("/generate")}>
              <Sparkles className="w-4 h-4 mr-2" />
              Generate Resume
            </Button>
          </Card>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {resumes.map((resume) => {
              const status = getScoreStatus(resume.ats_score || 0);
              return (
                <Card key={resume.id} className="p-6 bg-card shadow-soft hover:shadow-medium transition-all">
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex items-start gap-3">
                      <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
                        <FileText className="w-6 h-6 text-primary" />
                      </div>
                      <div>
                        <h3 className="font-semibold text-foreground mb-1">{resume.title}</h3>
                        <p className="text-xs text-muted-foreground mt-1">Generated {formatDate(resume.created_at)}</p>
                      </div>
                    </div>
                  </div>

                  <div className="mb-4">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm text-muted-foreground">ATS Score</span>
                      <div className="flex items-center gap-1">
                        <TrendingUp className="w-4 h-4 text-success" />
                        <span className="text-sm font-semibold text-success">{resume.ats_score}%</span>
                      </div>
                    </div>
                    <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
                      <div
                        className={`h-full ${
                          status === "high"
                            ? "bg-success"
                            : status === "medium"
                            ? "bg-warning"
                            : "bg-destructive"
                        }`}
                        style={{ width: `${resume.ats_score}%` }}
                      />
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <Button variant="outline" className="flex-1">
                      <Eye className="w-4 h-4 mr-2" />
                      Preview
                    </Button>
                    <Button variant="default" className="flex-1">
                      <Download className="w-4 h-4 mr-2" />
                      Download
                    </Button>
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default Resumes;
