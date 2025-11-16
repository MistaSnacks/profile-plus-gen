import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { FileText, TrendingUp, Download, Eye, Loader2, Sparkles, AlertCircle, CheckCircle, Target, ChevronDown, Trash2, Edit2, Save, X, Check, FolderPlus } from "lucide-react";
import { Navigation } from "@/components/Navigation";
import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { exportResumeWithTemplate, ATSTemplate } from "@/utils/resumeTemplates";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

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
  const [previewResume, setPreviewResume] = useState<Resume | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState("");
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysis, setAnalysis] = useState<string | null>(null);
  const [isReformatting, setIsReformatting] = useState(false);
  const [reformattedResume, setReformattedResume] = useState<{content: string, atsScore: number} | null>(null);
  const [showComparison, setShowComparison] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<ATSTemplate>('classic');
  const [selectedFormat, setSelectedFormat] = useState<'pdf' | 'docx'>('pdf');

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

  const handlePreview = (resume: Resume) => {
    setPreviewResume(resume);
  };

  const handleDownload = (resume: Resume) => {
    exportResumeWithTemplate(resume, selectedTemplate, selectedFormat);
    toast({
      title: "Download Started",
      description: `Downloading ${selectedTemplate} template as ${selectedFormat.toUpperCase()}`,
    });
  };

  const handleEditTitle = (resume: Resume) => {
    setEditingId(resume.id);
    setEditingTitle(resume.title);
  };

  const handleSaveTitle = async (resumeId: string) => {
    if (!editingTitle.trim()) {
      toast({
        title: "Error",
        description: "Title cannot be empty",
        variant: "destructive",
      });
      return;
    }

    try {
      const { error } = await supabase
        .from('generated_resumes')
        .update({ title: editingTitle })
        .eq('id', resumeId);

      if (error) throw error;

      setResumes(prev => prev.map(r => 
        r.id === resumeId ? { ...r, title: editingTitle } : r
      ));
      
      setEditingId(null);
      toast({
        title: "Title updated",
        description: "Resume title has been updated successfully",
      });
    } catch (error) {
      console.error('Error updating title:', error);
      toast({
        title: "Error",
        description: "Failed to update title",
        variant: "destructive",
      });
    }
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setEditingTitle("");
  };

  const handleDelete = async () => {
    if (!deleteId) return;

    try {
      const { error } = await supabase
        .from('generated_resumes')
        .delete()
        .eq('id', deleteId);

      if (error) throw error;

      setResumes(prev => prev.filter(r => r.id !== deleteId));
      setDeleteId(null);
      
      if (previewResume?.id === deleteId) {
        setPreviewResume(null);
      }

      toast({
        title: "Resume deleted",
        description: "Resume has been deleted successfully",
      });
    } catch (error) {
      console.error('Error deleting resume:', error);
      toast({
        title: "Error",
        description: "Failed to delete resume",
        variant: "destructive",
      });
    }
  };

  const handleAnalyze = async () => {
    if (!previewResume) return;

    setIsAnalyzing(true);
    setAnalysis(null);
    setReformattedResume(null);
    setShowComparison(false);

    try {
      const { data, error } = await supabase.functions.invoke('analyze-resume', {
        body: { resumeId: previewResume.id }
      });

      if (error) throw error;

      setAnalysis(data.analysis);
      toast({
        title: "Analysis Complete",
        description: "AI insights generated successfully.",
      });
    } catch (error) {
      console.error('Error analyzing resume:', error);
      toast({
        title: "Error",
        description: "Failed to generate analysis",
        variant: "destructive",
      });
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleReformat = async () => {
    if (!previewResume || !analysis) {
      toast({
        title: "No Analysis",
        description: "Please generate AI analysis first before reformatting.",
        variant: "destructive",
      });
      return;
    }

    setIsReformatting(true);
    try {
      const { data, error } = await supabase.functions.invoke('reformat-resume', {
        body: { resumeId: previewResume.id, analysis }
      });

      if (error) throw error;

      setReformattedResume({
        content: data.content,
        atsScore: data.atsScore
      });
      setShowComparison(true);
      toast({
        title: "Reformat Complete",
        description: "Resume has been reformatted based on AI suggestions.",
      });
    } catch (error) {
      console.error('Error reformatting resume:', error);
      toast({
        title: "Reformat Failed",
        description: "Failed to reformat resume. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsReformatting(false);
    }
  };

  const handleSaveReformatted = async () => {
    if (!previewResume || !reformattedResume) return;

    try {
      const { error } = await supabase
        .from('generated_resumes')
        .update({
          content: reformattedResume.content,
          ats_score: reformattedResume.atsScore
        })
        .eq('id', previewResume.id);

      if (error) throw error;

      setResumes(resumes.map(r => 
        r.id === previewResume.id 
          ? { ...r, content: reformattedResume.content, ats_score: reformattedResume.atsScore }
          : r
      ));

      toast({
        title: "Resume Updated",
        description: "Your resume has been updated with the reformatted version.",
      });

      setPreviewResume(null);
      setReformattedResume(null);
      setShowComparison(false);
      setAnalysis(null);
    } catch (error) {
      console.error('Error saving reformatted resume:', error);
      toast({
        title: "Save Failed",
        description: "Failed to save the reformatted resume.",
        variant: "destructive",
      });
    }
  };

  const handleSaveAsNewResume = async () => {
    if (!previewResume || !reformattedResume) return;

    try {
      const { data, error } = await supabase
        .from('generated_resumes')
        .insert({
          title: `${previewResume.title} (Optimized)`,
          content: reformattedResume.content,
          ats_score: reformattedResume.atsScore,
          user_id: user?.id,
          job_description_id: null
        })
        .select()
        .single();

      if (error) throw error;

      setResumes([data, ...resumes]);

      toast({
        title: "Resume Saved",
        description: "Optimized resume saved to My Resumes.",
      });

      setPreviewResume(null);
      setReformattedResume(null);
      setShowComparison(false);
      setAnalysis(null);
    } catch (error) {
      console.error('Error saving new resume:', error);
      toast({
        title: "Save Failed",
        description: "Failed to save as new resume.",
        variant: "destructive",
      });
    }
  };

  const handleSaveToDocuments = async () => {
    if (!previewResume || !reformattedResume) return;

    try {
      // Create a blob from the content
      const blob = new Blob([reformattedResume.content], { type: 'text/plain' });
      const fileName = `${previewResume.title}_optimized.txt`;
      const filePath = `${user?.id}/${fileName}`;

      // Upload to storage
      const { error: uploadError } = await supabase.storage
        .from('documents')
        .upload(filePath, blob, { upsert: true });

      if (uploadError) throw uploadError;

      // Create document record
      const { error: dbError } = await supabase
        .from('documents')
        .insert({
          name: fileName,
          file_path: filePath,
          type: 'resume',
          user_id: user?.id,
          extracted_text: reformattedResume.content,
          file_size: blob.size
        });

      if (dbError) throw dbError;

      toast({
        title: "Added to Documents",
        description: "Optimized resume added to your knowledge base.",
      });

      setPreviewResume(null);
      setReformattedResume(null);
      setShowComparison(false);
      setAnalysis(null);
    } catch (error) {
      console.error('Error saving to documents:', error);
      toast({
        title: "Save Failed",
        description: "Failed to add to documents.",
        variant: "destructive",
      });
    }
  };

  const getInsights = (score: number) => {
    const status = getScoreStatus(score);
    
    const insights = {
      high: {
        summary: "Excellent ATS compatibility!",
        icon: CheckCircle,
        color: "text-success",
        recommendations: [
          "Your resume is well-optimized for ATS systems",
          "Consider adding more quantifiable achievements",
          "Keep keywords relevant to target job descriptions",
          "Maintain consistent formatting throughout"
        ]
      },
      medium: {
        summary: "Good ATS score with room for improvement",
        icon: Target,
        color: "text-warning",
        recommendations: [
          "Add more industry-specific keywords from job descriptions",
          "Use standard section headings (Experience, Education, Skills)",
          "Include more measurable results and achievements",
          "Ensure consistent formatting and clear hierarchy",
          "Add relevant technical skills and certifications"
        ]
      },
      low: {
        summary: "Needs significant optimization for ATS",
        icon: AlertCircle,
        color: "text-destructive",
        recommendations: [
          "Use standard resume section headings",
          "Add keywords directly from target job descriptions",
          "Include clear dates and job titles",
          "List technical skills in a dedicated section",
          "Use simple, ATS-friendly formatting",
          "Add quantifiable achievements and metrics",
          "Remove graphics, tables, or complex formatting"
        ]
      }
    };

    return insights[status];
  };

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
                    <div className="flex items-start gap-3 flex-1">
                      <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
                        <FileText className="w-6 h-6 text-primary" />
                      </div>
                      <div className="flex-1">
                        {editingId === resume.id ? (
                          <div className="flex items-center gap-2">
                            <Input
                              value={editingTitle}
                              onChange={(e) => setEditingTitle(e.target.value)}
                              className="h-8"
                              autoFocus
                            />
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => handleSaveTitle(resume.id)}
                            >
                              <Save className="w-4 h-4" />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={handleCancelEdit}
                            >
                              <X className="w-4 h-4" />
                            </Button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2">
                            <h3 className="font-semibold text-foreground">{resume.title}</h3>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => handleEditTitle(resume)}
                              className="h-6 w-6 p-0"
                            >
                              <Edit2 className="w-3 h-3" />
                            </Button>
                          </div>
                        )}
                        <p className="text-xs text-muted-foreground mt-1">Generated {formatDate(resume.created_at)}</p>
                      </div>
                    </div>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setDeleteId(resume.id)}
                      className="text-destructive hover:text-destructive"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
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
                    <Button 
                      variant="outline" 
                      className="flex-1"
                      onClick={() => handlePreview(resume)}
                    >
                      <Eye className="w-4 h-4 mr-2" />
                      Preview
                    </Button>
                    <DropdownMenu>
                       <DropdownMenuTrigger asChild>
                        <Button variant="default" className="flex-1">
                          <Download className="w-4 h-4 mr-2" />
                          Download
                          <ChevronDown className="w-4 h-4 ml-2" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent>
                        <DropdownMenuItem onClick={() => handleDownload(resume)}>
                          Download ({selectedTemplate} - {selectedFormat.toUpperCase()})
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* Preview Dialog */}
      <Dialog open={!!previewResume} onOpenChange={() => {
        setPreviewResume(null);
        setAnalysis(null);
        setReformattedResume(null);
        setShowComparison(false);
      }}>
        <DialogContent className="max-w-6xl max-h-[90vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center justify-between flex-wrap gap-2">
              <span>{previewResume?.title}</span>
              <div className="flex items-center gap-2">
                <Badge variant={previewResume && getScoreStatus(previewResume.ats_score || 0) === "high" ? "default" : previewResume && getScoreStatus(previewResume.ats_score || 0) === "medium" ? "secondary" : "destructive"}>
                  Original: {previewResume?.ats_score}%
                </Badge>
                {reformattedResume && (
                  <Badge variant={getScoreStatus(reformattedResume.atsScore) === "high" ? "default" : getScoreStatus(reformattedResume.atsScore) === "medium" ? "secondary" : "destructive"}>
                    New: {reformattedResume.atsScore}%
                  </Badge>
                )}
              </div>
            </DialogTitle>
            <DialogDescription>
              Generated {previewResume && formatDate(previewResume.created_at)}
            </DialogDescription>
          </DialogHeader>
          
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 h-[70vh]">
            {/* Insights Panel */}
            <div className="lg:col-span-1 space-y-4 overflow-y-auto">
              {previewResume && (() => {
                const insights = getInsights(previewResume.ats_score || 0);
                const Icon = insights.icon;
                const status = getScoreStatus(previewResume.ats_score || 0);
                
                return (
                  <>
                    {/* Score Card */}
                    <Card className="p-4 bg-gradient-card">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm text-muted-foreground">ATS Score</span>
                        <Badge variant={status === "high" ? "default" : status === "medium" ? "secondary" : "destructive"}>
                          {previewResume.ats_score}%
                        </Badge>
                      </div>
                      <div className="w-full h-2 bg-muted rounded-full overflow-hidden mb-3">
                        <div
                          className={`h-full ${
                            status === "high"
                              ? "bg-success"
                              : status === "medium"
                              ? "bg-warning"
                              : "bg-destructive"
                          }`}
                          style={{ width: `${previewResume.ats_score}%` }}
                        />
                      </div>
                      <div className={`flex items-center gap-2 ${insights.color}`}>
                        <Icon className="w-5 h-5" />
                        <p className="text-sm font-medium">{insights.summary}</p>
                      </div>
                    </Card>

                    {/* AI Analysis Button */}
                    <Button
                      onClick={handleAnalyze}
                      disabled={isAnalyzing}
                      className="w-full"
                      variant="outline"
                    >
                      {isAnalyzing ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          Analyzing...
                        </>
                      ) : (
                        <>
                          <Sparkles className="w-4 h-4 mr-2" />
                          AI Analysis
                        </>
                      )}
                    </Button>

                    {/* AI Analysis Results */}
                    {analysis && (
                      <Card className="p-4 bg-gradient-card">
                        <div className="flex items-center gap-2 mb-3">
                          <Sparkles className="w-5 h-5 text-primary" />
                          <h3 className="font-semibold text-foreground">AI Analysis</h3>
                        </div>
                        <ScrollArea className="h-[300px]">
                          <div className="prose prose-sm max-w-none">
                            <pre className="whitespace-pre-wrap font-sans text-xs text-muted-foreground">
                              {analysis}
                            </pre>
                          </div>
                        </ScrollArea>
                        {!showComparison && (
                          <Button
                            onClick={handleReformat}
                            disabled={isReformatting}
                            className="w-full mt-3"
                          >
                            {isReformatting ? (
                              <>
                                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                Reformatting...
                              </>
                            ) : (
                              <>
                                <Sparkles className="w-4 h-4 mr-2" />
                                Apply Suggestions & Reformat
                              </>
                            )}
                          </Button>
                        )}
                      </Card>
                    )}

                    {/* Recommendations Card */}
                    {!analysis && (
                      <Card className="p-4 bg-gradient-card">
                        <div className="flex items-center gap-2 mb-3">
                          <Target className="w-5 h-5 text-primary" />
                          <h3 className="font-semibold text-foreground">Quick Tips</h3>
                        </div>
                        <ul className="space-y-2">
                          {insights.recommendations.map((rec, idx) => (
                            <li key={idx} className="flex items-start gap-2 text-sm text-muted-foreground">
                              <span className="text-primary mt-1">•</span>
                              <span>{rec}</span>
                            </li>
                          ))}
                        </ul>
                      </Card>
                    )}
                  </>
                );
              })()}
            </div>

            {/* Resume Content */}
            {showComparison && reformattedResume ? (
              <div className="lg:col-span-2 grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <h4 className="text-sm font-semibold">Original</h4>
                    <Badge variant="outline">{previewResume?.ats_score}%</Badge>
                  </div>
                  <ScrollArea className="h-[calc(70vh-2rem)] rounded-md border p-4 bg-background">
                    <pre className="whitespace-pre-wrap font-sans text-xs text-foreground">
                      {previewResume?.content}
                    </pre>
                  </ScrollArea>
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <h4 className="text-sm font-semibold">Reformatted</h4>
                    <Badge variant="default">
                      {reformattedResume.atsScore}%
                      {reformattedResume.atsScore > (previewResume?.ats_score || 0) && (
                        <span className="ml-1">
                          +{reformattedResume.atsScore - (previewResume?.ats_score || 0)}
                        </span>
                      )}
                    </Badge>
                  </div>
                  <ScrollArea className="h-[calc(70vh-2rem)] rounded-md border p-4 bg-muted/30">
                    <pre className="whitespace-pre-wrap font-sans text-xs text-foreground">
                      {reformattedResume.content}
                    </pre>
                  </ScrollArea>
                </div>
              </div>
            ) : (
              <ScrollArea className="lg:col-span-2 h-full rounded-md border p-4 bg-background">
                <div className="prose prose-sm max-w-none">
                  <pre className="whitespace-pre-wrap font-sans text-sm text-foreground">
                    {previewResume?.content}
                  </pre>
                </div>
              </ScrollArea>
            )}
          </div>

          <div className="flex flex-col gap-4">
            {showComparison && (
              <div className="flex gap-2 flex-wrap">
                <Button onClick={handleSaveReformatted}>
                  <Save className="w-4 h-4 mr-2" />
                  Update Current Resume
                </Button>
                <Button onClick={handleSaveAsNewResume} variant="outline">
                  <FolderPlus className="w-4 h-4 mr-2" />
                  Save as New Resume
                </Button>
                <Button onClick={handleSaveToDocuments} variant="outline">
                  <FileText className="w-4 h-4 mr-2" />
                  Add to Documents
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => {
                    setShowComparison(false);
                    setReformattedResume(null);
                  }}
                >
                  <X className="w-4 h-4 mr-2" />
                  Keep Original
                </Button>
              </div>
            )}
            
            <div className="flex gap-2 justify-between items-end">
              <div className="flex gap-2 items-end">
                <div className="space-y-1.5">
                  <label className="text-xs text-muted-foreground">Template</label>
                  <Select value={selectedTemplate} onValueChange={(value) => setSelectedTemplate(value as ATSTemplate)}>
                    <SelectTrigger className="w-[140px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="classic">Classic ATS</SelectItem>
                      <SelectItem value="modern">Modern ATS</SelectItem>
                      <SelectItem value="minimal">Minimal ATS</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs text-muted-foreground">Format</label>
                  <Select value={selectedFormat} onValueChange={(value) => setSelectedFormat(value as 'pdf' | 'docx')}>
                    <SelectTrigger className="w-[100px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="pdf">PDF</SelectItem>
                      <SelectItem value="docx">DOCX</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => {
                  setPreviewResume(null);
                  setAnalysis(null);
                  setReformattedResume(null);
                  setShowComparison(false);
                }}>
                  Close
                </Button>
                <Button onClick={() => {
                  if (previewResume) {
                    const resume = showComparison && reformattedResume
                      ? { ...previewResume, content: reformattedResume.content, ats_score: reformattedResume.atsScore }
                      : previewResume;
                    handleDownload(resume);
                  }
                }}>
                  <Download className="w-4 h-4 mr-2" />
                  Download
                </Button>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete this resume. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default Resumes;
