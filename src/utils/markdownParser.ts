// Simple markdown parser to highlight changes marked in bold
export const parseResumeMarkdown = (text: string): string => {
  // Convert **text** to <strong>text</strong> for bold formatting
  // Also add a highlight class for visual emphasis
  return text.replace(
    /\*\*(.+?)\*\*/g,
    '<strong class="text-primary font-bold bg-primary/10 px-1 rounded">$1</strong>'
  );
};
