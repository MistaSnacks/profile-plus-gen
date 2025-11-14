import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";

interface PageHeaderProps {
  title: string;
  description: string;
}

export const PageHeader = ({ title, description }: PageHeaderProps) => {
  const navigate = useNavigate();

  return (
    <header className="mb-8">
      <Button
        variant="ghost"
        onClick={() => navigate("/")}
        className="mb-4 -ml-2"
      >
        <ArrowLeft className="w-4 h-4 mr-2" />
        Back to Dashboard
      </Button>
      <h1 className="text-4xl font-bold text-foreground mb-2">{title}</h1>
      <p className="text-muted-foreground">{description}</p>
    </header>
  );
};
