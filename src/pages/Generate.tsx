import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Upload, Sparkles, FileText, TrendingUp } from "lucide-react";
import { useState, useEffect } from "react";
import { useToast } from "@/hooks/use-toast";
import { Navigation } from "@/components/Navigation";
import { useAuth } from "@/hooks/useAuth";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { motion } from "framer-motion";

const Generate = () => {
  const { toast } = useToast();
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [jobDescription, setJobDescription] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);

  useEffect(() => {
    if (!loading && !user) {
      navigate("/auth");
    }
  }, [user, loading, navigate]);

  const handleGenerate = async () => {
    if (!jobDescription.trim()) {
      toast({
        title: "Job description required",
        description: "Please enter a job description to generate resumes",
        variant: "destructive",
      });
      return;
    }

    setIsGenerating(true);
    try {
      const { data, error } = await supabase.functions.invoke("generate-resume", {
        body: { jobDescription },
      });

      if (error) throw error;

      toast({
        title: "Resume generated!",
        description: `Your resume has been created with an ATS score of ${data.atsScore}%`,
      });
      
      navigate("/resumes");
    } catch (error) {
      console.error("Generation error:", error);
      toast({
        title: "Error",
        description: "Failed to generate resume. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsGenerating(false);
    }
  };

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
          <h1 className="text-4xl font-bold text-foreground mb-2">Generate Resume</h1>
          <p className="text-muted-foreground">Paste or upload a job description to create tailored resumes</p>
        </motion.header>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="lg:col-span-2 space-y-6"
          >
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
                <motion.div className="flex-1" whileTap={{ scale: 0.98 }}>
                  <Button 
                    className="w-full bg-gradient-primary" 
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
                </motion.div>
              </div>
            </Card>
          </motion.div>

          <div className="space-y-6">
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.5, delay: 0.2 }}
            >
              <Card className="p-6 bg-gradient-primary shadow-medium overflow-hidden relative">
                <div className="absolute inset-0 bg-gradient-to-br from-white/5 to-transparent pointer-events-none" />
                <Sparkles className="w-8 h-8 text-white mb-3 relative z-10" />
                <h3 className="text-lg font-semibold text-white mb-2 relative z-10">AI Analysis</h3>
                <p className="text-white/90 text-sm relative z-10">
                  Our AI will analyze the job description, identify key requirements, and match them with your experience to create optimized resumes.
                </p>
              </Card>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.5, delay: 0.3 }}
            >
              <Card className="p-6 bg-card shadow-soft">
                <h3 className="text-lg font-semibold text-foreground mb-4">Tips for Best Results</h3>
                <ul className="space-y-3 text-sm text-muted-foreground">
                  {[
                    "Include the complete job description",
                    "Make sure requirements are clearly listed",
                    "Upload all relevant experience documents first",
                    "Review and customize the generated resumes",
                  ].map((tip, i) => (
                    <motion.li
                      key={i}
                      initial={{ opacity: 0, x: 10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ duration: 0.3, delay: 0.4 + i * 0.08 }}
                      className="flex items-start gap-2"
                    >
                      <span className="w-1.5 h-1.5 rounded-full bg-primary mt-1.5 flex-shrink-0" />
                      {tip}
                    </motion.li>
                  ))}
                </ul>
              </Card>
            </motion.div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Generate;
