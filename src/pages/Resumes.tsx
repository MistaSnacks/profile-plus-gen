import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { FileText, TrendingUp, Download, Eye, Star } from "lucide-react";

const Resumes = () => {
  const resumes = [
    {
      title: "Senior Software Engineer",
      company: "Tech Corp Inc.",
      score: 96,
      date: "2 days ago",
      status: "high",
    },
    {
      title: "Full Stack Developer",
      company: "StartupXYZ",
      score: 94,
      date: "5 days ago",
      status: "high",
    },
    {
      title: "Frontend Engineer",
      company: "Design Studio",
      score: 91,
      date: "1 week ago",
      status: "high",
    },
    {
      title: "Backend Developer",
      company: "Cloud Services Ltd",
      score: 88,
      date: "2 weeks ago",
      status: "medium",
    },
    {
      title: "DevOps Engineer",
      company: "Infrastructure Co",
      score: 85,
      date: "3 weeks ago",
      status: "medium",
    },
  ];

  return (
    <div className="min-h-screen bg-gradient-subtle">
      <div className="container mx-auto px-4 py-8">
        <header className="mb-8">
          <h1 className="text-4xl font-bold text-foreground mb-2">My Resumes</h1>
          <p className="text-muted-foreground">View and manage all your generated resumes</p>
        </header>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <Card className="p-4 bg-gradient-card shadow-soft">
            <p className="text-sm text-muted-foreground mb-1">Total Resumes</p>
            <p className="text-3xl font-bold text-foreground">12</p>
          </Card>
          <Card className="p-4 bg-gradient-card shadow-soft">
            <p className="text-sm text-muted-foreground mb-1">Avg Score</p>
            <p className="text-3xl font-bold text-success">94%</p>
          </Card>
          <Card className="p-4 bg-gradient-card shadow-soft">
            <p className="text-sm text-muted-foreground mb-1">This Month</p>
            <p className="text-3xl font-bold text-foreground">7</p>
          </Card>
          <Card className="p-4 bg-gradient-card shadow-soft">
            <p className="text-sm text-muted-foreground mb-1">Downloaded</p>
            <p className="text-3xl font-bold text-foreground">18</p>
          </Card>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {resumes.map((resume, i) => (
            <Card key={i} className="p-6 bg-card shadow-soft hover:shadow-medium transition-all">
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-start gap-3">
                  <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
                    <FileText className="w-6 h-6 text-primary" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-foreground mb-1">{resume.title}</h3>
                    <p className="text-sm text-muted-foreground">{resume.company}</p>
                    <p className="text-xs text-muted-foreground mt-1">Generated {resume.date}</p>
                  </div>
                </div>
                <Button size="icon" variant="ghost">
                  <Star className="w-4 h-4" />
                </Button>
              </div>

              <div className="mb-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-muted-foreground">ATS Score</span>
                  <div className="flex items-center gap-1">
                    <TrendingUp className="w-4 h-4 text-success" />
                    <span className="text-sm font-semibold text-success">{resume.score}%</span>
                  </div>
                </div>
                <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
                  <div
                    className={`h-full ${
                      resume.status === "high" ? "bg-success" : "bg-warning"
                    }`}
                    style={{ width: `${resume.score}%` }}
                  />
                </div>
              </div>

              <div className="flex gap-2">
                <Button variant="outline" size="sm" className="flex-1">
                  <Eye className="w-4 h-4 mr-2" />
                  Preview
                </Button>
                <Button size="sm" className="flex-1 bg-primary">
                  <Download className="w-4 h-4 mr-2" />
                  Download
                </Button>
              </div>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
};

export default Resumes;
