import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Upload, FileText, Briefcase, Award, Linkedin, X } from "lucide-react";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";

const Documents = () => {
  const { toast } = useToast();
  const [isDragging, setIsDragging] = useState(false);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    toast({
      title: "Files uploaded",
      description: "Your documents have been added successfully",
    });
  };

  const documents = [
    { name: "Current_Resume_2024.pdf", type: "resume", size: "245 KB", date: "2 days ago" },
    { name: "Work_Experience_Tech.docx", type: "experience", size: "128 KB", date: "1 week ago" },
    { name: "Skills_List.pdf", type: "skills", size: "89 KB", date: "2 weeks ago" },
  ];

  return (
    <div className="min-h-screen bg-gradient-subtle">
      <div className="container mx-auto px-4 py-8">
        <header className="mb-8">
          <h1 className="text-4xl font-bold text-foreground mb-2">Document Library</h1>
          <p className="text-muted-foreground">Manage your resumes, work experience, and skills documents</p>
        </header>

        <div
          className={`mb-8 border-2 border-dashed rounded-2xl p-12 text-center transition-all ${
            isDragging ? "border-primary bg-primary/5 scale-[1.02]" : "border-border bg-card"
          }`}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
            <Upload className="w-8 h-8 text-primary" />
          </div>
          <h3 className="text-lg font-semibold text-foreground mb-2">Drag & drop your files here</h3>
          <p className="text-muted-foreground mb-4">or click to browse</p>
          <Button className="bg-gradient-primary">
            <Upload className="w-4 h-4 mr-2" />
            Upload Files
          </Button>
          <p className="text-xs text-muted-foreground mt-4">Supports PDF, DOCX • Max 10MB per file</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 mb-8">
          <Card className="p-6 bg-gradient-card shadow-soft hover:shadow-medium transition-all hover:scale-[1.02] cursor-pointer">
            <FileText className="w-8 h-8 text-primary mb-3" />
            <h3 className="font-semibold text-foreground mb-1">Resumes</h3>
            <p className="text-2xl font-bold text-foreground mb-1">3</p>
            <p className="text-xs text-muted-foreground">Base versions</p>
          </Card>

          <Card className="p-6 bg-gradient-card shadow-soft hover:shadow-medium transition-all hover:scale-[1.02] cursor-pointer">
            <Briefcase className="w-8 h-8 text-secondary mb-3" />
            <h3 className="font-semibold text-foreground mb-1">Experience</h3>
            <p className="text-2xl font-bold text-foreground mb-1">5</p>
            <p className="text-xs text-muted-foreground">Work documents</p>
          </Card>

          <Card className="p-6 bg-gradient-card shadow-soft hover:shadow-medium transition-all hover:scale-[1.02] cursor-pointer">
            <Award className="w-8 h-8 text-accent mb-3" />
            <h3 className="font-semibold text-foreground mb-1">Skills</h3>
            <p className="text-2xl font-bold text-foreground mb-1">2</p>
            <p className="text-xs text-muted-foreground">Skill lists</p>
          </Card>

          <Card className="p-6 bg-gradient-card shadow-soft hover:shadow-medium transition-all hover:scale-[1.02] cursor-pointer">
            <Linkedin className="w-8 h-8 text-info mb-3" />
            <h3 className="font-semibold text-foreground mb-1">LinkedIn</h3>
            <p className="text-sm text-muted-foreground">Not connected</p>
            <Button size="sm" variant="outline" className="mt-2">Connect</Button>
          </Card>
        </div>

        <Card className="p-6 bg-card shadow-soft">
          <h3 className="text-xl font-semibold text-foreground mb-4">All Documents</h3>
          <div className="space-y-3">
            {documents.map((doc, i) => (
              <div key={i} className="flex items-center justify-between p-4 rounded-lg bg-muted/50 hover:bg-muted transition-colors">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                    <FileText className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <p className="font-medium text-foreground">{doc.name}</p>
                    <p className="text-sm text-muted-foreground">{doc.size} • {doc.date}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Button size="sm" variant="outline">View</Button>
                  <Button size="sm" variant="ghost">
                    <X className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
};

export default Documents;
