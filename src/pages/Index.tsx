import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { ArrowRight, Sparkles, FileText, Zap, Target, CheckCircle2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useEffect } from "react";

const Index = () => {
  const navigate = useNavigate();
  const { user, loading } = useAuth();

  useEffect(() => {
    if (!loading && user) {
      navigate("/documents");
    }
  }, [user, loading, navigate]);

  return (
    <div className="min-h-screen bg-gradient-subtle overflow-hidden">
      {/* Hero Section */}
      <section className="relative min-h-screen flex items-center justify-center px-4 py-20">
        {/* Animated background elements */}
        <motion.div
          className="absolute top-20 left-10 w-64 h-64 bg-secondary/20 rounded-full blur-3xl"
          animate={{
            scale: [1, 1.2, 1],
            opacity: [0.3, 0.5, 0.3],
          }}
          transition={{
            duration: 8,
            repeat: Infinity,
            ease: "easeInOut",
          }}
        />
        <motion.div
          className="absolute bottom-20 right-10 w-96 h-96 bg-primary/20 rounded-full blur-3xl"
          animate={{
            scale: [1.2, 1, 1.2],
            opacity: [0.3, 0.5, 0.3],
          }}
          transition={{
            duration: 10,
            repeat: Infinity,
            ease: "easeInOut",
          }}
        />

        <div className="container mx-auto relative z-10">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            {/* Left Content */}
            <motion.div
              initial={{ opacity: 0, x: -50 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.8 }}
              className="space-y-8"
            >
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
                className="inline-flex items-center gap-2 px-4 py-2 bg-primary/10 rounded-full border border-primary/20"
              >
                <Sparkles className="w-4 h-4 text-primary" />
                <span className="text-sm font-medium text-primary">AI-Powered Resume Tailoring</span>
              </motion.div>

              <motion.h1
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 }}
                className="text-5xl lg:text-7xl font-bold leading-tight"
              >
                <span className="text-foreground">Tailor your resume</span>{" "}
                <span className="text-primary">to every job</span>
              </motion.h1>

              <motion.p
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.4 }}
                className="text-lg text-muted-foreground max-w-xl leading-relaxed"
              >
                Stop sending generic resumes. Our RAG-powered AI analyzes job descriptions and rewrites your resume to highlight the perfect skills—in seconds.
              </motion.p>

              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.5 }}
                className="flex flex-wrap gap-4"
              >
                <Button
                  size="lg"
                  onClick={() => navigate("/auth")}
                  className="bg-primary text-primary-foreground hover:bg-primary-hover shadow-glow group font-semibold"
                >
                  Get Started Free
                  <ArrowRight className="ml-2 w-4 h-4 group-hover:translate-x-1 transition-transform" />
                </Button>
                <Button
                  size="lg"
                  variant="ghost"
                  onClick={() => navigate("/resumes")}
                  className="text-foreground hover:bg-muted font-semibold"
                >
                  See How It Works
                </Button>
              </motion.div>

              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.6 }}
                className="flex items-center gap-6 text-sm text-muted-foreground"
              >
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-secondary" />
                  <span>No credit card required</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-secondary" />
                  <span>Free forever</span>
                </div>
              </motion.div>
            </motion.div>

            {/* Right Visual */}
            <motion.div
              initial={{ opacity: 0, x: 50 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.8, delay: 0.2 }}
              className="relative"
            >
              <motion.div
                animate={{ y: [0, -20, 0] }}
                transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
                className="relative"
              >
                {/* Main Card */}
                <div className="bg-card rounded-2xl shadow-strong p-8 border border-border">
                  <div className="space-y-6">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 rounded-lg bg-gradient-primary flex items-center justify-center">
                        <FileText className="w-6 h-6 text-white" />
                      </div>
                      <div>
                        <div className="h-4 bg-primary/20 rounded w-32 mb-2" />
                        <div className="h-3 bg-muted rounded w-24" />
                      </div>
                    </div>
                    <div className="space-y-3">
                      <div className="h-3 bg-muted rounded w-full" />
                      <div className="h-3 bg-muted rounded w-5/6" />
                      <div className="h-3 bg-muted rounded w-4/6" />
                    </div>
                    <div className="flex items-center gap-2 pt-4">
                      <div className="flex-1 h-2 bg-gradient-primary rounded-full" />
                      <span className="text-sm font-medium text-primary">95% Match</span>
                    </div>
                  </div>
                </div>

                {/* Floating Elements */}
                <motion.div
                  animate={{ y: [0, -10, 0], rotate: [0, 5, 0] }}
                  transition={{ duration: 4, repeat: Infinity, ease: "easeInOut", delay: 0.5 }}
                  className="absolute -right-6 -top-6 bg-secondary text-white rounded-xl shadow-medium p-4"
                >
                  <Zap className="w-6 h-6" />
                </motion.div>

                <motion.div
                  animate={{ y: [0, 10, 0], rotate: [0, -5, 0] }}
                  transition={{ duration: 5, repeat: Infinity, ease: "easeInOut", delay: 1 }}
                  className="absolute -left-6 -bottom-6 bg-primary text-white rounded-xl shadow-medium p-4"
                >
                  <Target className="w-6 h-6" />
                </motion.div>
              </motion.div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-20 px-4 bg-background relative">
        <div className="container mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="text-center mb-16"
          >
            <h2 className="text-4xl lg:text-5xl font-bold mb-4">
              Why Choose <span className="text-primary">TAILOR</span>?
            </h2>
            <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
              Powerful features designed to help you stand out from the competition
            </p>
          </motion.div>

          <div className="grid md:grid-cols-3 gap-8">
            {[
              {
                icon: Sparkles,
                title: "AI-Powered Matching",
                description: "Our AI analyzes job descriptions and optimizes your resume to match perfectly",
                color: "primary",
              },
              {
                icon: Target,
                title: "ATS Optimization",
                description: "Boost your ATS score and get past automated screening systems",
                color: "secondary",
              },
              {
                icon: Zap,
                title: "Instant Generation",
                description: "Generate tailored resumes in seconds, not hours",
                color: "primary",
              },
            ].map((feature, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.6, delay: index * 0.2 }}
                whileHover={{ y: -8, transition: { duration: 0.2 } }}
                className="bg-card rounded-2xl p-8 border border-border shadow-soft hover:shadow-medium transition-all"
              >
                <div className={`w-14 h-14 rounded-xl bg-${feature.color}/10 flex items-center justify-center mb-6`}>
                  <feature.icon className={`w-7 h-7 text-${feature.color}`} />
                </div>
                <h3 className="text-2xl font-bold mb-3">{feature.title}</h3>
                <p className="text-muted-foreground">{feature.description}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 px-4 relative overflow-hidden">
        <motion.div
          className="absolute inset-0 bg-gradient-hero opacity-10"
          animate={{
            scale: [1, 1.1, 1],
          }}
          transition={{
            duration: 15,
            repeat: Infinity,
            ease: "easeInOut",
          }}
        />
        <div className="container mx-auto relative z-10">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="bg-card rounded-3xl shadow-strong p-12 lg:p-16 text-center border border-border"
          >
            <h2 className="text-4xl lg:text-5xl font-bold mb-6">
              Ready to Land Your Dream Job?
            </h2>
            <p className="text-xl text-muted-foreground mb-8 max-w-2xl mx-auto">
              Join thousands of job seekers who have improved their resumes with TAILOR
            </p>
            <Button
              size="lg"
              onClick={() => navigate("/auth")}
              className="bg-gradient-primary text-white hover:opacity-90 shadow-glow text-lg px-8 py-6 group"
            >
              Start Tailoring Now
              <ArrowRight className="ml-2 w-5 h-5 group-hover:translate-x-1 transition-transform" />
            </Button>
          </motion.div>
        </div>
      </section>
    </div>
  );
};

export default Index;
