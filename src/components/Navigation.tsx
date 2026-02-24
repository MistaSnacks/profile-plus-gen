import { FileText, Sparkles, FolderOpen, MessageSquare, LogOut } from "lucide-react";
import { NavLink } from "./NavLink";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "./ui/button";
import { ThemeToggle } from "./ThemeToggle";

export const Navigation = () => {
  const { signOut } = useAuth();
  const navItems = [
    { to: "/documents", icon: FileText, label: "Documents" },
    { to: "/generate", icon: Sparkles, label: "Generate" },
    { to: "/resumes", icon: FolderOpen, label: "Resumes" },
    { to: "/chat", icon: MessageSquare, label: "Chat" },
  ];

  return (
    <nav className="bg-card/90 backdrop-blur-md border-b border-border/60 sticky top-0 z-50 shadow-[0_2px_12px_hsl(0_0%_0%/0.4),inset_0_-1px_0_hsl(0_0%_0%/0.2),inset_0_1px_0_hsl(0_0%_100%/0.04)]">
      <div className="container mx-auto px-4">
        <div className="flex items-center justify-between py-3">
          <div className="flex items-center gap-1.5">
            {navItems.map(({ to, icon: Icon, label }) => (
              <NavLink
                key={to}
                to={to}
                className="flex items-center gap-2 px-4 py-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-all text-sm font-medium"
                activeClassName="bg-muted text-foreground shadow-[inset_0_1px_0_hsl(0_0%_100%/0.06),0_1px_3px_hsl(0_0%_0%/0.3)]"
              >
                <Icon className="w-4 h-4" />
                <span className="hidden sm:inline">{label}</span>
              </NavLink>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <Button
              variant="ghost"
              size="sm"
              onClick={signOut}
              className="flex items-center gap-2 text-muted-foreground hover:text-destructive text-sm"
            >
              <LogOut className="w-4 h-4" />
              <span className="hidden sm:inline">Sign Out</span>
            </Button>
          </div>
        </div>
      </div>
    </nav>
  );
};
