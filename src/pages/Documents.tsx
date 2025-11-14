import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Upload, FileText, Briefcase, Award, Linkedin, X, Loader2, Trash2 } from "lucide-react";
import { useState, useEffect, useRef } from "react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { Input } from "@/components/ui/input";
import { Navigation } from "@/components/Navigation";

type Document = {
  id: string;
  name: string;
  type: string;
  file_size: number | null;
  created_at: string;
  file_path: string;
};

const Documents = () => {
  const { toast } = useToast();
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [loadingDocs, setLoadingDocs] = useState(true);

  useEffect(() => {
    if (!loading && !user) {
      navigate("/auth");
    }
  }, [user, loading, navigate]);

  useEffect(() => {
    if (user) {
      fetchDocuments();
    }
  }, [user]);

  const fetchDocuments = async () => {
    try {
      const { data, error } = await supabase
        .from("documents")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;
      setDocuments(data || []);
    } catch (error) {
      console.error("Error fetching documents:", error);
      toast({
        title: "Error",
        description: "Failed to load documents",
        variant: "destructive",
      });
    } finally {
      setLoadingDocs(false);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    
    const files = Array.from(e.dataTransfer.files);
    await uploadFiles(files);
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    await uploadFiles(files);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const uploadFiles = async (files: File[]) => {
    if (!user) return;
    
    setUploading(true);
    
    for (const file of files) {
      try {
        // Validate file
        if (file.size > 10 * 1024 * 1024) {
          toast({
            title: "File too large",
            description: `${file.name} exceeds 10MB limit`,
            variant: "destructive",
          });
          continue;
        }

        const fileExt = file.name.split(".").pop()?.toLowerCase();
        if (!["pdf", "docx", "doc", "txt"].includes(fileExt || "")) {
          toast({
            title: "Invalid file type",
            description: `${file.name} is not a supported format`,
            variant: "destructive",
          });
          continue;
        }

        // Upload to storage
        const filePath = `${user.id}/${Date.now()}_${file.name}`;
        const { error: uploadError } = await supabase.storage
          .from("documents")
          .upload(filePath, file);

        if (uploadError) throw uploadError;

        // Create document record
        const { data: doc, error: docError } = await supabase
          .from("documents")
          .insert({
            user_id: user.id,
            name: file.name,
            type: "resume",
            file_path: filePath,
            file_size: file.size,
          })
          .select()
          .single();

        if (docError) throw docError;

        // Process document
        const { error: processError } = await supabase.functions.invoke(
          "process-document",
          {
            body: { documentId: doc.id },
          }
        );

        if (processError) {
          console.error("Error processing document:", processError);
        }

        toast({
          title: "Upload successful",
          description: `${file.name} has been uploaded and is being processed`,
        });
      } catch (error) {
        console.error("Upload error:", error);
        toast({
          title: "Upload failed",
          description: `Failed to upload ${file.name}`,
          variant: "destructive",
        });
      }
    }

    setUploading(false);
    fetchDocuments();
  };

  const handleDelete = async (docId: string, filePath: string) => {
    try {
      // Delete from storage
      const { error: storageError } = await supabase.storage
        .from("documents")
        .remove([filePath]);

      if (storageError) throw storageError;

      // Delete from database
      const { error: dbError } = await supabase
        .from("documents")
        .delete()
        .eq("id", docId);

      if (dbError) throw dbError;

      toast({
        title: "Deleted",
        description: "Document has been removed",
      });

      fetchDocuments();
    } catch (error) {
      console.error("Delete error:", error);
      toast({
        title: "Delete failed",
        description: "Failed to delete document",
        variant: "destructive",
      });
    }
  };

  const formatFileSize = (bytes: number | null) => {
    if (!bytes) return "Unknown size";
    return bytes < 1024 * 1024
      ? `${(bytes / 1024).toFixed(0)} KB`
      : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
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

  if (loading || !user) {
    return null;
  }

  const docsByType = {
    resume: documents.filter((d) => d.type === "resume").length,
    experience: documents.filter((d) => d.type === "experience").length,
    skills: documents.filter((d) => d.type === "skills").length,
  };


  return (
    <div className="min-h-screen bg-gradient-subtle">
      <Navigation />
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
            {uploading ? (
              <Loader2 className="w-8 h-8 text-primary animate-spin" />
            ) : (
              <Upload className="w-8 h-8 text-primary" />
            )}
          </div>
          <h3 className="text-lg font-semibold text-foreground mb-2">
            {uploading ? "Uploading..." : "Drag & drop your files here"}
          </h3>
          <p className="text-muted-foreground mb-4">or click to browse</p>
          <Input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.docx,.doc,.txt"
            multiple
            className="hidden"
            onChange={handleFileSelect}
            disabled={uploading}
          />
          <Button
            className="bg-gradient-primary"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
          >
            {uploading ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Uploading...
              </>
            ) : (
              <>
                <Upload className="w-4 h-4 mr-2" />
                Upload Files
              </>
            )}
          </Button>
          <p className="text-xs text-muted-foreground mt-4">Supports PDF, DOCX • Max 10MB per file</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 mb-8">
          <Card className="p-6 bg-gradient-card shadow-soft hover:shadow-medium transition-all hover:scale-[1.02]">
            <FileText className="w-8 h-8 text-primary mb-3" />
            <h3 className="font-semibold text-foreground mb-1">Resumes</h3>
            <p className="text-2xl font-bold text-foreground mb-1">{docsByType.resume}</p>
            <p className="text-xs text-muted-foreground">Base versions</p>
          </Card>

          <Card className="p-6 bg-gradient-card shadow-soft hover:shadow-medium transition-all hover:scale-[1.02]">
            <Briefcase className="w-8 h-8 text-secondary mb-3" />
            <h3 className="font-semibold text-foreground mb-1">Experience</h3>
            <p className="text-2xl font-bold text-foreground mb-1">{docsByType.experience}</p>
            <p className="text-xs text-muted-foreground">Work documents</p>
          </Card>

          <Card className="p-6 bg-gradient-card shadow-soft hover:shadow-medium transition-all hover:scale-[1.02]">
            <Award className="w-8 h-8 text-accent mb-3" />
            <h3 className="font-semibold text-foreground mb-1">Skills</h3>
            <p className="text-2xl font-bold text-foreground mb-1">{docsByType.skills}</p>
            <p className="text-xs text-muted-foreground">Skill lists</p>
          </Card>

          <Card className="p-6 bg-gradient-card shadow-soft hover:shadow-medium transition-all hover:scale-[1.02]">
            <Linkedin className="w-8 h-8 text-info mb-3" />
            <h3 className="font-semibold text-foreground mb-1">LinkedIn</h3>
            <p className="text-sm text-muted-foreground">Not connected</p>
            <Button size="sm" variant="outline" className="mt-2">Connect</Button>
          </Card>
        </div>

        <Card className="p-6 bg-card shadow-soft">
          <h3 className="text-xl font-semibold text-foreground mb-4">All Documents</h3>
          {loadingDocs ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 text-primary animate-spin" />
            </div>
          ) : documents.length === 0 ? (
            <div className="text-center py-12">
              <FileText className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
              <p className="text-muted-foreground">No documents yet. Upload your first document above.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {documents.map((doc) => (
                <div key={doc.id} className="flex items-center justify-between p-4 rounded-lg bg-muted/50 hover:bg-muted transition-colors">
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                      <FileText className="w-5 h-5 text-primary" />
                    </div>
                    <div>
                      <p className="font-medium text-foreground">{doc.name}</p>
                      <p className="text-sm text-muted-foreground">
                        {formatFileSize(doc.file_size)} • {formatDate(doc.created_at)}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleDelete(doc.id, doc.file_path)}
                    >
                      <X className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
};

export default Documents;
