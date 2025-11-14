import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Upload, Sparkles, FileText, TrendingUp } from "lucide-react";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";

const Generate = () => {
  const { toast } = useToast();
  const [jobDescription, setJobDescription] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [showResults, setShowResults] = useState(false);

  const handleGenerate = () => {
    if (!jobDescription.trim()) {
      toast({
        title: "Job description required",
        description: "Please enter a job description to generate resumes",
        variant: "destructive",
      });
      return;
    }

    setIsGenerating(true);
    setTimeout(() => {
      setIsGenerating(false);
      setShowResults(true);
      toast({
        title: "Resumes generated!",
        description: "3 tailored resume options are ready for review",
      });
    }, 2000);
  };

  const resumeOptions = [
    { title: "Executive Format", score: 96, description: "Emphasizes leadership and strategic achievements" },
    { title: "Technical Focus", score: 94, description: "Highlights technical skills and project experience" },
    { title: "Balanced Approach", score: 92, description: "Equal emphasis on technical and soft skills" },
  ];

  return (
    <div className="min-h-screen bg-gradient-subtle">
      <div className="container mx-auto px-4 py-8">
        <header className="mb-8">
          <h1 className="text-4xl font-bold text-foreground mb-2">Generate Resume</h1>
          <p className="text-muted-foreground">Paste or upload a job description to create tailored resumes</p>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            <Card className="p-6 bg-card shadow-soft">
              <h3 className="text-lg font-semibold text-foreground mb-4">Job Description</h3>
              <Textarea
                placeholder="Paste the job description here or upload a file..."
                className="min-h-[300px] resize-none"
                value={jobDescription}
                onChange={(e) => setJobDescription(e.target.value)}
              />
              <div className="flex items-center gap-3 mt-4">
                <Button variant="outline" className="flex-1">
                  <Upload className="w-4 h-4 mr-2" />
                  Upload File
                </Button>
                <Button 
                  className="flex-1 bg-gradient-primary" 
                  onClick={handleGenerate}
                  disabled={isGenerating}
                >
                  {isGenerating ? (
                    <>Generating...</>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4 mr-2" />
                      Generate Resumes
                    </>
                  )}
                </Button>
              </div>
            </Card>

            {showResults && (
              <Card className="p-6 bg-card shadow-soft">
                <h3 className="text-lg font-semibold text-foreground mb-4">Generated Options</h3>
                <div className="space-y-4">
                  {resumeOptions.map((option, i) => (
                    <div key={i} className="p-4 rounded-lg border border-border bg-gradient-card hover:shadow-soft transition-all">
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                            <FileText className="w-5 h-5 text-primary" />
                          </div>
                          <div>
                            <h4 className="font-semibold text-foreground">{option.title}</h4>
                            <p className="text-sm text-muted-foreground">{option.description}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-success/10">
                          <TrendingUp className="w-4 h-4 text-success" />
                          <span className="text-sm font-semibold text-success">{option.score}%</span>
                        </div>
                      </div>
                      <div className="flex gap-2 mt-3">
                        <Button size="sm" variant="outline" className="flex-1">Preview</Button>
                        <Button size="sm" className="flex-1 bg-primary">Download</Button>
                      </div>
                    </div>
                  ))}
                </div>
              </Card>
            )}
          </div>

          <div className="space-y-6">
            <Card className="p-6 bg-gradient-primary shadow-medium">
              <Sparkles className="w-8 h-8 text-white mb-3" />
              <h3 className="text-lg font-semibold text-white mb-2">AI Analysis</h3>
              <p className="text-white/90 text-sm">
                Our AI will analyze the job description, identify key requirements, and match them with your experience to create optimized resumes.
              </p>
            </Card>

            <Card className="p-6 bg-card shadow-soft">
              <h3 className="text-lg font-semibold text-foreground mb-4">Tips for Best Results</h3>
              <ul className="space-y-3 text-sm text-muted-foreground">
                <li className="flex items-start gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-primary mt-1.5 flex-shrink-0" />
                  Include the complete job description
                </li>
                <li className="flex items-start gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-primary mt-1.5 flex-shrink-0" />
                  Make sure requirements are clearly listed
                </li>
                <li className="flex items-start gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-primary mt-1.5 flex-shrink-0" />
                  Upload all relevant experience documents first
                </li>
                <li className="flex items-start gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-primary mt-1.5 flex-shrink-0" />
                  Review and customize the generated resumes
                </li>
              </ul>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Generate;
