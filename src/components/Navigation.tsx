import { FileText, Sparkles, FolderOpen, MessageSquare, LogOut } from "lucide-react";
import { NavLink } from "./NavLink";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "./ui/button";

export const Navigation = () => {
  const { signOut } = useAuth();
  const navItems = [
    { to: "/documents", icon: FileText, label: "Documents" },
    { to: "/generate", icon: Sparkles, label: "Generate" },
    { to: "/resumes", icon: FolderOpen, label: "Resumes" },
    { to: "/chat", icon: MessageSquare, label: "Chat" },
  ];

  return (
    <nav className="bg-background/95 backdrop-blur-sm border-b border-border sticky top-0 z-50">
      <div className="container mx-auto px-4">
        <div className="flex items-center justify-between py-3">
          <div className="flex items-center gap-1">
            {navItems.map(({ to, icon: Icon, label }) => (
              <NavLink
                key={to}
                to={to}
                className="flex items-center gap-2 px-4 py-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent/50 transition-all"
                activeClassName="bg-accent text-foreground font-medium"
              >
                <Icon className="w-4 h-4" />
                <span className="hidden sm:inline">{label}</span>
              </NavLink>
            ))}
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={signOut}
            className="flex items-center gap-2 text-muted-foreground hover:text-foreground"
          >
            <LogOut className="w-4 h-4" />
            <span className="hidden sm:inline">Sign Out</span>
          </Button>
        </div>
      </div>
    </nav>
  );
};
