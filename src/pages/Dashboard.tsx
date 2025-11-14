import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { FileText, Upload, Sparkles, TrendingUp } from "lucide-react";
import { Link } from "react-router-dom";

const Dashboard = () => {
  return (
    <div className="min-h-screen bg-gradient-subtle">
      <div className="container mx-auto px-4 py-8">
        <header className="mb-8">
          <h1 className="text-4xl font-bold text-foreground mb-2">Resume Studio</h1>
          <p className="text-muted-foreground">AI-powered ATS resume optimization</p>
        </header>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <Card className="p-6 bg-gradient-card shadow-soft hover:shadow-medium transition-shadow">
            <div className="flex items-center justify-between mb-4">
              <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
                <FileText className="w-6 h-6 text-primary" />
              </div>
              <span className="text-3xl font-bold text-foreground">12</span>
            </div>
            <p className="text-muted-foreground text-sm">Resumes Created</p>
          </Card>

          <Card className="p-6 bg-gradient-card shadow-soft hover:shadow-medium transition-shadow">
            <div className="flex items-center justify-between mb-4">
              <div className="w-12 h-12 rounded-xl bg-secondary/10 flex items-center justify-center">
                <Upload className="w-6 h-6 text-secondary" />
              </div>
              <span className="text-3xl font-bold text-foreground">8</span>
            </div>
            <p className="text-muted-foreground text-sm">Documents Uploaded</p>
          </Card>

          <Card className="p-6 bg-gradient-card shadow-soft hover:shadow-medium transition-shadow">
            <div className="flex items-center justify-between mb-4">
              <div className="w-12 h-12 rounded-xl bg-success/10 flex items-center justify-center">
                <TrendingUp className="w-6 h-6 text-success" />
              </div>
              <span className="text-3xl font-bold text-foreground">94%</span>
            </div>
            <p className="text-muted-foreground text-sm">Avg ATS Score</p>
          </Card>

          <Card className="p-6 bg-gradient-card shadow-soft hover:shadow-medium transition-shadow">
            <div className="flex items-center justify-between mb-4">
              <div className="w-12 h-12 rounded-xl bg-accent/10 flex items-center justify-center">
                <Sparkles className="w-6 h-6 text-accent" />
              </div>
              <span className="text-3xl font-bold text-foreground">24</span>
            </div>
            <p className="text-muted-foreground text-sm">AI Generations</p>
          </Card>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <Card className="lg:col-span-2 p-8 bg-gradient-primary shadow-medium">
            <h2 className="text-2xl font-bold text-white mb-3">Create Your Next Resume</h2>
            <p className="text-white/90 mb-6">Upload a job description and let AI craft the perfect resume tailored to the position</p>
            <Link to="/generate">
              <Button size="lg" className="bg-white text-primary hover:bg-white/90">
                <Sparkles className="w-5 h-5 mr-2" />
                Generate Resume
              </Button>
            </Link>
          </Card>

          <Card className="p-6 bg-gradient-card shadow-soft">
            <h3 className="text-lg font-semibold text-foreground mb-4">Quick Actions</h3>
            <div className="space-y-3">
              <Link to="/documents">
                <Button variant="outline" className="w-full justify-start">
                  <Upload className="w-4 h-4 mr-2" />
                  Upload Documents
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
        </div>

        <div className="mt-8">
          <h3 className="text-xl font-semibold text-foreground mb-4">Recent Resumes</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2, 3].map((i) => (
              <Card key={i} className="p-6 bg-card shadow-soft hover:shadow-medium transition-all hover:scale-[1.02]">
                <div className="flex items-start justify-between mb-3">
                  <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                    <FileText className="w-5 h-5 text-primary" />
                  </div>
                  <div className="flex items-center gap-1">
                    <TrendingUp className="w-4 h-4 text-success" />
                    <span className="text-sm font-semibold text-success">92%</span>
                  </div>
                </div>
                <h4 className="font-semibold text-foreground mb-1">Senior Software Engineer</h4>
                <p className="text-sm text-muted-foreground mb-3">Tech Corp Inc.</p>
                <p className="text-xs text-muted-foreground">Generated 2 days ago</p>
              </Card>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
