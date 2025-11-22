import { parseResumeMarkdown } from "@/utils/markdownParser";

interface ResumeContentProps {
  content: string;
}

export const ResumeContent = ({ content }: ResumeContentProps) => {
  const parsedContent = parseResumeMarkdown(content);
  
  return (
    <pre 
      className="whitespace-pre-wrap font-sans text-xs text-foreground"
      dangerouslySetInnerHTML={{ __html: parsedContent }}
    />
  );
};
