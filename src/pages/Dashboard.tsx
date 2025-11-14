import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { FileText, Briefcase, Award, TrendingUp, Upload, Sparkles, LogOut, MessageSquare } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Navigation } from "@/components/Navigation";

const Dashboard = () => {
  const { user, loading, signOut } = useAuth();
  const navigate = useNavigate();
  const [stats, setStats] = useState({
    documents: 0,
    resumes: 0,
    avgScore: 0,
  });

  useEffect(() => {
    if (!loading && !user) {
      navigate("/auth");
    }
  }, [user, loading, navigate]);

  useEffect(() => {
    if (user) {
      fetchStats();
    }
  }, [user]);

  const fetchStats = async () => {
    if (!user) return;

    const [{ count: documentsCount }, { count: resumesCount }, { data: resumes }] = await Promise.all([
      supabase.from('documents').select('*', { count: 'exact', head: true }).eq('user_id', user.id),
      supabase.from('generated_resumes').select('*', { count: 'exact', head: true }).eq('user_id', user.id),
      supabase.from('generated_resumes').select('ats_score').eq('user_id', user.id),
    ]);

    const avgScore = resumes && resumes.length > 0
      ? Math.round(resumes.reduce((sum, r) => sum + (r.ats_score || 0), 0) / resumes.length)
      : 0;

    setStats({
      documents: documentsCount || 0,
      resumes: resumesCount || 0,
      avgScore,
    });
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-subtle flex items-center justify-center">
        <div className="text-center">
          <Sparkles className="w-12 h-12 text-primary animate-pulse mx-auto mb-4" />
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  return (
    <div className="min-h-screen bg-gradient-subtle">
      <Navigation />
      <div className="container mx-auto px-4 py-8">
        <header className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-4xl font-bold text-foreground mb-2">Dashboard</h1>
            <p className="text-muted-foreground">Welcome back, {user.email}</p>
          </div>
          <div className="flex gap-3">
            <Link to="/generate">
              <Button className="bg-gradient-primary shadow-soft hover:shadow-medium transition-all">
                <Sparkles className="w-4 h-4 mr-2" />
                Generate Resume
              </Button>
            </Link>
            <Button variant="outline" onClick={signOut}>
              <LogOut className="w-4 h-4 mr-2" />
              Logout
            </Button>
          </div>
        </header>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <Card className="p-6 bg-gradient-card shadow-soft hover:shadow-medium transition-all">
            <FileText className="w-8 h-8 text-primary mb-3" />
            <h3 className="font-semibold text-foreground mb-1">Documents</h3>
            <p className="text-3xl font-bold text-foreground mb-1">{stats.documents}</p>
            <p className="text-sm text-muted-foreground">Uploaded files</p>
          </Card>

          <Card className="p-6 bg-gradient-card shadow-soft hover:shadow-medium transition-all">
            <Briefcase className="w-8 h-8 text-secondary mb-3" />
            <h3 className="font-semibold text-foreground mb-1">Generated</h3>
            <p className="text-3xl font-bold text-foreground mb-1">{stats.resumes}</p>
            <p className="text-sm text-muted-foreground">Resumes created</p>
          </Card>

          <Card className="p-6 bg-gradient-card shadow-soft hover:shadow-medium transition-all">
            <TrendingUp className="w-8 h-8 text-success mb-3" />
            <h3 className="font-semibold text-foreground mb-1">Avg. ATS Score</h3>
            <p className="text-3xl font-bold text-foreground mb-1">{stats.avgScore}%</p>
            <p className="text-sm text-muted-foreground">
              {stats.avgScore >= 80 ? 'Excellent match' : stats.avgScore >= 60 ? 'Good match' : 'Needs improvement'}
            </p>
          </Card>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          <Card className="p-6 bg-card shadow-soft">
            <h3 className="text-xl font-semibold text-foreground mb-4">Quick Actions</h3>
            <div className="space-y-3">
              <Link to="/documents">
                <Button variant="outline" className="w-full justify-start">
                  <Upload className="w-4 h-4 mr-2" />
                  Upload Documents
                </Button>
              </Link>
              <Link to="/generate">
                <Button variant="outline" className="w-full justify-start">
                  <Sparkles className="w-4 h-4 mr-2" />
                  Generate New Resume
                </Button>
              </Link>
              <Link to="/chat">
                <Button variant="outline" className="w-full justify-start">
                  <MessageSquare className="w-4 h-4 mr-2" />
                  Chat with Documents
                </Button>
              </Link>
              <Link to="/resumes">
                <Button variant="outline" className="w-full justify-start">
                  <FileText className="w-4 h-4 mr-2" />
                  View All Resumes
                </Button>
              </Link>
            </div>
          </Card>

          <Card className="p-6 bg-gradient-primary shadow-medium">
            <Award className="w-8 h-8 text-white mb-3" />
            <h3 className="text-xl font-semibold text-white mb-2">ATS Optimization</h3>
            <p className="text-white/90 mb-4">
              Our AI analyzes job descriptions and matches them with your experience to create optimized, ATS-friendly resumes.
            </p>
            <Progress value={stats.avgScore} className="bg-white/20" />
            <p className="text-white/90 text-sm mt-2">Current average: {stats.avgScore}%</p>
          </Card>
        </div>

        <Card className="p-6 bg-card shadow-soft">
          <h3 className="text-xl font-semibold text-foreground mb-4">How It Works</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="text-center">
              <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-3">
                <Upload className="w-8 h-8 text-primary" />
              </div>
              <h4 className="font-semibold text-foreground mb-2">1. Upload Documents</h4>
              <p className="text-sm text-muted-foreground">
                Upload your resumes, work experience, and skills documents
              </p>
            </div>
            <div className="text-center">
              <div className="w-16 h-16 rounded-2xl bg-secondary/10 flex items-center justify-center mx-auto mb-3">
                <Sparkles className="w-8 h-8 text-secondary" />
              </div>
              <h4 className="font-semibold text-foreground mb-2">2. Paste Job Description</h4>
              <p className="text-sm text-muted-foreground">
                Add the job description you want to apply for
              </p>
            </div>
            <div className="text-center">
              <div className="w-16 h-16 rounded-2xl bg-success/10 flex items-center justify-center mx-auto mb-3">
                <TrendingUp className="w-8 h-8 text-success" />
              </div>
              <h4 className="font-semibold text-foreground mb-2">3. Get Tailored Resume</h4>
              <p className="text-sm text-muted-foreground">
                Receive multiple optimized resumes with ATS scores
              </p>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
};

export default Dashboard;
