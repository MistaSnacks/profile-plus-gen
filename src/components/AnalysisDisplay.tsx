import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CheckCircle, AlertTriangle, XCircle } from "lucide-react";

interface AnalysisDisplayProps {
  analysis: string;
}

export const AnalysisDisplay = ({ analysis }: AnalysisDisplayProps) => {
  // Parse the analysis to identify categorized sections
  const parseAnalysis = (text: string) => {
    const lines = text.split('\n');
    const categorized: {
      rephrase: string[];
      inference: string[];
      gap: string[];
      other: string[];
    } = { rephrase: [], inference: [], gap: [], other: [] };

    let currentCategory = 'other';
    
    for (const line of lines) {
      const trimmedLine = line.trim();
      
      // Detect category headers
      if (trimmedLine.includes('[REPHRASE]') || trimmedLine.toLowerCase().includes('rephrase existing')) {
        currentCategory = 'rephrase';
        categorized.rephrase.push(trimmedLine);
      } else if (trimmedLine.includes('[INFERENCE]') || trimmedLine.toLowerCase().includes('reasonable inference')) {
        currentCategory = 'inference';
        categorized.inference.push(trimmedLine);
      } else if (trimmedLine.includes('[GAP]') || trimmedLine.toLowerCase().includes('skills gap')) {
        currentCategory = 'gap';
        categorized.gap.push(trimmedLine);
      } else if (trimmedLine.length > 0) {
        // Add non-empty lines to current category
        categorized[currentCategory as keyof typeof categorized].push(trimmedLine);
      }
    }

    return categorized;
  };

  const categorized = parseAnalysis(analysis);
  
  // Count items for summary
  const rephraseCount = categorized.rephrase.filter(l => l.startsWith('-') || l.startsWith('•')).length;
  const inferenceCount = categorized.inference.filter(l => l.startsWith('-') || l.startsWith('•')).length;
  const gapCount = categorized.gap.filter(l => l.startsWith('-') || l.startsWith('•')).length;
  
  const totalVerified = rephraseCount + inferenceCount;
  const fabricationRate = totalVerified > 0 ? Math.round((gapCount / (totalVerified + gapCount)) * 100) : 0;

  return (
    <div className="space-y-4">
      {/* Verification Summary */}
      <Card className="border-primary/20">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <CheckCircle className="w-4 h-4 text-success" />
            Truth Verification Summary
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">From Documents</span>
            <Badge variant="outline" className="bg-success/10 text-success border-success/20">
              {rephraseCount} verified
            </Badge>
          </div>
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">Reasonable Inferences</span>
            <Badge variant="outline" className="bg-warning/10 text-warning border-warning/20">
              {inferenceCount} inferred
            </Badge>
          </div>
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">Skills Gaps (Not Added)</span>
            <Badge variant="outline" className="bg-destructive/10 text-destructive border-destructive/20">
              {gapCount} gaps
            </Badge>
          </div>
          <div className="pt-2 mt-2 border-t">
            <div className="flex items-center justify-between text-xs font-medium">
              <span>Fabrication Risk</span>
              <span className={fabricationRate < 10 ? 'text-success' : fabricationRate < 25 ? 'text-warning' : 'text-destructive'}>
                {fabricationRate}%
              </span>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {fabricationRate < 10 && "Excellent - all suggestions are verifiable"}
              {fabricationRate >= 10 && fabricationRate < 25 && "Good - most suggestions are verifiable"}
              {fabricationRate >= 25 && "Review carefully - significant skills gaps identified"}
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Verified Content (Rephrase) */}
      {categorized.rephrase.length > 0 && (
        <Card className="border-success/20">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <CheckCircle className="w-5 h-5 text-success" />
              <div>
                <CardTitle className="text-sm">From Your Documents</CardTitle>
                <CardDescription className="text-xs">Skills and experiences we can reword for impact</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="prose prose-sm max-w-none">
              {categorized.rephrase.map((line, idx) => (
                <p key={idx} className="text-xs text-foreground leading-relaxed mb-1">
                  {line.replace(/\[REPHRASE\]/g, '')}
                </p>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Inferred Content */}
      {categorized.inference.length > 0 && (
        <Card className="border-warning/20">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-warning" />
              <div>
                <CardTitle className="text-sm">Reasonable Inferences</CardTitle>
                <CardDescription className="text-xs">Adjacent skills logically connected to your experience</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="prose prose-sm max-w-none">
              {categorized.inference.map((line, idx) => (
                <p key={idx} className="text-xs text-foreground leading-relaxed mb-1">
                  {line.replace(/\[INFERENCE\]/g, '')}
                </p>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Skills Gaps */}
      {categorized.gap.length > 0 && (
        <Card className="border-destructive/20">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <XCircle className="w-5 h-5 text-destructive" />
              <div>
                <CardTitle className="text-sm">Skills to Develop</CardTitle>
                <CardDescription className="text-xs">Job requirements not found in your documents - NOT added to resume</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="prose prose-sm max-w-none">
              {categorized.gap.map((line, idx) => (
                <p key={idx} className="text-xs text-muted-foreground leading-relaxed mb-1 line-through">
                  {line.replace(/\[GAP\]/g, '')}
                </p>
              ))}
            </div>
            <p className="text-xs text-destructive mt-3 p-2 bg-destructive/5 rounded border border-destructive/10">
              <strong>Important:</strong> These will NOT be added to your resume. Consider these as learning goals.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Other Content (Formatting, ATS Issues, etc.) */}
      {categorized.other.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Additional Recommendations</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="prose prose-sm max-w-none">
              {categorized.other.map((line, idx) => (
                <p key={idx} className="text-xs text-foreground leading-relaxed mb-1">
                  {line}
                </p>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};
