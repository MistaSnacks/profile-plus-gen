import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { FileText, Briefcase, Award, TrendingUp, Upload, Sparkles, LogOut, MessageSquare } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Navigation } from "@/components/Navigation";
import { motion } from "framer-motion";

const fadeUp = {
  hidden: { opacity: 0, y: 20 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.5, delay: i * 0.1, ease: "easeOut" as const },
  }),
};

const Dashboard = () => {
  const { user, loading, signOut } = useAuth();
  const navigate = useNavigate();
  const [stats, setStats] = useState({
    documents: 0,
    resumes: 0,
    avgScore: 0,
  });

  useEffect(() => {
    if (!loading && !user) {
      navigate("/auth");
    }
  }, [user, loading, navigate]);

  useEffect(() => {
    if (user) {
      fetchStats();
    }
  }, [user]);

  const fetchStats = async () => {
    if (!user) return;

    const [{ count: documentsCount }, { count: resumesCount }, { data: resumes }] = await Promise.all([
      supabase.from('documents').select('*', { count: 'exact', head: true }).eq('user_id', user.id),
      supabase.from('generated_resumes').select('*', { count: 'exact', head: true }).eq('user_id', user.id),
      supabase.from('generated_resumes').select('ats_score').eq('user_id', user.id),
    ]);

    const avgScore = resumes && resumes.length > 0
      ? Math.round(resumes.reduce((sum, r) => sum + (r.ats_score || 0), 0) / resumes.length)
      : 0;

    setStats({
      documents: documentsCount || 0,
      resumes: resumesCount || 0,
      avgScore,
    });
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-subtle flex items-center justify-center">
        <div className="text-center">
          <Sparkles className="w-12 h-12 text-primary animate-pulse mx-auto mb-4" />
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  if (!user) return null;

  const statCards = [
    { icon: FileText, label: "Documents", value: stats.documents, sub: "Uploaded files", color: "text-primary" },
    { icon: Briefcase, label: "Generated", value: stats.resumes, sub: "Resumes created", color: "text-secondary" },
    { icon: TrendingUp, label: "Avg. ATS Score", value: `${stats.avgScore}%`, sub: stats.avgScore >= 80 ? 'Excellent match' : stats.avgScore >= 60 ? 'Good match' : 'Needs improvement', color: "text-neon-green" },
  ];

  const steps = [
    { icon: Upload, label: "1. Upload Documents", desc: "Upload your resumes, work experience, and skills documents", color: "text-primary", bg: "bg-primary/10" },
    { icon: Sparkles, label: "2. Paste Job Description", desc: "Add the job description you want to apply for", color: "text-secondary", bg: "bg-secondary/10" },
    { icon: TrendingUp, label: "3. Get Tailored Resume", desc: "Receive multiple optimized resumes with ATS scores", color: "text-neon-green", bg: "bg-neon-green/10" },
  ];

  return (
    <div className="min-h-screen bg-gradient-subtle">
      <Navigation />
      <div className="container mx-auto px-4 py-8">
        <motion.header
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="mb-8 flex items-center justify-between"
        >
          <div>
            <h1 className="text-4xl font-bold text-foreground mb-2">Dashboard</h1>
            <p className="text-muted-foreground">Welcome back, {user.email}</p>
          </div>
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.4, delay: 0.2 }}
            className="flex gap-3"
          >
            <Link to="/generate">
              <Button className="bg-gradient-primary shadow-soft hover:shadow-medium transition-all">
                <Sparkles className="w-4 h-4 mr-2" />
                Generate Resume
              </Button>
            </Link>
            <Button variant="outline" onClick={signOut}>
              <LogOut className="w-4 h-4 mr-2" />
              Logout
            </Button>
          </motion.div>
        </motion.header>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          {statCards.map((card, i) => (
            <motion.div
              key={card.label}
              custom={i}
              initial="hidden"
              animate="visible"
              variants={fadeUp}
              whileHover={{ y: -4, transition: { duration: 0.2 } }}
            >
              <Card className="p-6 bg-gradient-card shadow-soft hover:shadow-medium transition-shadow">
                <card.icon className={`w-8 h-8 ${card.color} mb-3`} />
                <h3 className="font-semibold text-foreground mb-1">{card.label}</h3>
                <p className="text-3xl font-bold text-foreground mb-1">{card.value}</p>
                <p className="text-sm text-muted-foreground">{card.sub}</p>
              </Card>
            </motion.div>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.5, delay: 0.3 }}
          >
            <Card className="p-6 bg-card shadow-soft">
              <h3 className="text-xl font-semibold text-foreground mb-4">Quick Actions</h3>
              <div className="space-y-3">
                {[
                  { to: "/documents", icon: Upload, label: "Upload Documents" },
                  { to: "/generate", icon: Sparkles, label: "Generate New Resume" },
                  { to: "/chat", icon: MessageSquare, label: "Chat with Documents" },
                  { to: "/resumes", icon: FileText, label: "View All Resumes" },
                ].map((action, i) => (
                  <motion.div
                    key={action.to}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.3, delay: 0.4 + i * 0.08 }}
                  >
                    <Link to={action.to}>
                      <Button variant="outline" className="w-full justify-start hover:translate-x-1 transition-transform">
                        <action.icon className="w-4 h-4 mr-2" />
                        {action.label}
                      </Button>
                    </Link>
                  </motion.div>
                ))}
              </div>
            </Card>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.5, delay: 0.4 }}
          >
            <Card className="p-6 bg-gradient-primary shadow-medium">
              <Award className="w-8 h-8 text-white mb-3" />
              <h3 className="text-xl font-semibold text-white mb-2">ATS Optimization</h3>
              <p className="text-white/90 mb-4">
                Our AI analyzes job descriptions and matches them with your experience to create optimized, ATS-friendly resumes.
              </p>
              <Progress value={stats.avgScore} className="bg-white/20" />
              <p className="text-white/90 text-sm mt-2">Current average: {stats.avgScore}%</p>
            </Card>
          </motion.div>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.5 }}
        >
          <Card className="p-6 bg-card shadow-soft">
            <h3 className="text-xl font-semibold text-foreground mb-4">How It Works</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {steps.map((step, i) => (
                <motion.div
                  key={step.label}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.5, delay: 0.6 + i * 0.12 }}
                  className="text-center"
                >
                  <motion.div
                    whileHover={{ scale: 1.08, rotate: 2 }}
                    transition={{ type: "spring", stiffness: 300 }}
                    className={`w-16 h-16 rounded-2xl ${step.bg} flex items-center justify-center mx-auto mb-3`}
                  >
                    <step.icon className={`w-8 h-8 ${step.color}`} />
                  </motion.div>
                  <h4 className="font-semibold text-foreground mb-2">{step.label}</h4>
                  <p className="text-sm text-muted-foreground">{step.desc}</p>
                </motion.div>
              ))}
            </div>
          </Card>
        </motion.div>
      </div>
    </div>
  );
};

export default Dashboard;
