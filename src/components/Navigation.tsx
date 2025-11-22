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
    <nav className="bg-card/80 backdrop-blur-md border-b-2 border-primary/50 sticky top-0 z-50 shadow-glow dither-pattern relative">
      <div className="absolute inset-0 scanlines pointer-events-none opacity-20" />
      <div className="container mx-auto px-4 relative z-10">
        <div className="flex items-center justify-between py-4">
          <div className="flex items-center gap-2">
            {navItems.map(({ to, icon: Icon, label }) => (
              <NavLink
                key={to}
                to={to}
                className="flex items-center gap-2 px-4 py-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-primary/20 transition-all font-bold uppercase tracking-wider text-sm border-2 border-transparent hover:border-primary/50"
                activeClassName="bg-gradient-primary text-white shadow-glow border-2 border-primary"
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
              className="flex items-center gap-2 text-muted-foreground hover:text-neon-pink hover:bg-primary/10 font-bold uppercase tracking-wider border-2 border-transparent hover:border-primary/50"
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
