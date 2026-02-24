import { useEffect } from "react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { ArrowRight, Sparkles, Zap, Target, Shield, Clock, BarChart3 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { ThreeBackground } from "@/components/ThreeBackground";

const Index = () => {
  const navigate = useNavigate();
  const { user, loading } = useAuth();

  useEffect(() => {
    if (!loading && user) {
      navigate("/documents");
    }
  }, [user, loading, navigate]);

  return (
    <div className="min-h-screen bg-background overflow-hidden relative">
      <ThreeBackground />
      
      {/* Ambient glow - animated */}
      <div className="fixed inset-0 pointer-events-none z-[1]">
        <motion.div
          animate={{ opacity: [0.4, 0.7, 0.4], scale: [1, 1.05, 1] }}
          transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
          className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[400px] bg-primary/5 rounded-full blur-[120px]"
        />
        <motion.div
          animate={{ opacity: [0.3, 0.6, 0.3], scale: [1, 1.08, 1] }}
          transition={{ duration: 10, repeat: Infinity, ease: "easeInOut", delay: 2 }}
          className="absolute bottom-0 right-0 w-[600px] h-[300px] bg-secondary/5 rounded-full blur-[100px]"
        />
      </div>

      {/* Hero Section */}
      <section className="relative min-h-screen flex items-center justify-center px-4 py-20 z-10">
        <div className="container mx-auto">
          <div className="max-w-4xl mx-auto text-center space-y-10">
            {/* Badge */}
            <motion.div 
              initial={{ opacity: 0, y: 20, scale: 0.9 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
              className="inline-flex items-center gap-2.5 px-5 py-2.5 skeuo-card rounded-full"
            >
              <motion.div
                animate={{ opacity: [0.5, 1, 0.5] }}
                transition={{ duration: 2, repeat: Infinity }}
                className="w-2 h-2 rounded-full bg-neon-green"
              />
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-widest">
                AI-Powered Resume Builder
              </span>
            </motion.div>

            {/* Main Title */}
            <motion.h1 
              initial={{ opacity: 0, y: 40 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, delay: 0.15, ease: [0.16, 1, 0.3, 1] }}
              className="text-5xl lg:text-7xl font-bold leading-[1.1] tracking-tight"
            >
              <span className="text-foreground">Tailor Your </span>
              <motion.span
                animate={{ backgroundPosition: ["0% 50%", "100% 50%", "0% 50%"] }}
                transition={{ duration: 6, repeat: Infinity, ease: "linear" }}
                className="bg-gradient-neon bg-clip-text text-transparent bg-[length:200%_auto]"
              >
                Resume
              </motion.span>
              <br />
              <motion.span
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.8, delay: 0.4 }}
                className="text-muted-foreground text-4xl lg:text-5xl font-medium"
              >
                to Perfection
              </motion.span>
            </motion.h1>

            {/* Subtitle */}
            <motion.p
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, delay: 0.35 }}
              className="text-lg lg:text-xl text-muted-foreground max-w-2xl mx-auto leading-relaxed"
            >
              Our <span className="text-primary font-medium">RAG-powered AI</span> analyzes 
              job descriptions and rewrites your resume to highlight the{" "}
              <span className="text-secondary font-medium">perfect skills</span>—in seconds.
            </motion.p>

            {/* CTA Buttons */}
            <motion.div 
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, delay: 0.5 }}
              className="flex flex-wrap gap-4 justify-center items-center pt-4"
            >
              <motion.div whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.97 }}>
                <Button
                  size="lg"
                  onClick={() => navigate("/auth")}
                  className="group"
                >
                  Get Started Free
                  <ArrowRight className="w-4 h-4 ml-1 group-hover:translate-x-1 transition-transform" />
                </Button>
              </motion.div>
              <motion.div whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.97 }}>
                <Button
                  size="lg"
                  variant="outline"
                  onClick={() => navigate("/resumes")}
                  className="group"
                >
                  See How It Works
                  <Zap className="w-4 h-4 ml-1 group-hover:rotate-12 transition-transform" />
                </Button>
              </motion.div>
            </motion.div>

            {/* Trust indicators */}
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.8, delay: 0.7 }}
              className="flex flex-wrap gap-8 justify-center items-center pt-6 text-sm text-muted-foreground"
            >
              {[
                { icon: Shield, label: "No credit card required", color: "text-neon-green" },
                { icon: Clock, label: "Results in seconds", color: "text-secondary" },
                { icon: BarChart3, label: "ATS optimized", color: "text-primary" },
              ].map((item, i) => (
                <motion.div
                  key={item.label}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.4, delay: 0.8 + i * 0.1 }}
                  className="flex items-center gap-2"
                >
                  <item.icon className={`w-4 h-4 ${item.color}`} />
                  {item.label}
                </motion.div>
              ))}
            </motion.div>
          </div>
        </div>
      </section>

      {/* Features Grid */}
      <section className="py-24 px-4 relative z-10">
        <div className="container mx-auto">
          <motion.div 
            initial={{ opacity: 0, y: 40 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-100px" }}
            transition={{ duration: 0.8 }}
            className="text-center mb-16"
          >
            <h2 className="text-4xl lg:text-5xl font-bold mb-4 text-foreground">
              Why <span className="bg-gradient-neon bg-clip-text text-transparent">Tailor</span>?
            </h2>
            <p className="text-lg text-muted-foreground max-w-xl mx-auto">
              Powerful features designed to land you interviews
            </p>
          </motion.div>

          <div className="grid md:grid-cols-3 gap-6 max-w-5xl mx-auto">
            {[
              {
                icon: Sparkles,
                title: "AI Matching",
                description: "Our AI analyzes job descriptions and optimizes your resume to match perfectly with the role requirements.",
                accentColor: "text-primary",
                glowClass: "skeuo-glow-pink",
              },
              {
                icon: Target,
                title: "ATS Optimized",
                description: "Boost your ATS score and get past automated screening systems with properly structured content.",
                accentColor: "text-secondary",
                glowClass: "skeuo-glow-cyan",
              },
              {
                icon: Zap,
                title: "Instant Generation",
                description: "Generate tailored resumes in seconds, not hours. Paste a job description and get results immediately.",
                accentColor: "text-accent",
                glowClass: "",
              },
            ].map((feature, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, y: 40 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-50px" }}
                transition={{ duration: 0.6, delay: index * 0.15 }}
                whileHover={{ y: -6, transition: { duration: 0.25, ease: "easeOut" } }}
                className="group skeuo-card skeuo-highlight rounded-2xl p-8 transition-shadow duration-300"
              >
                <div className="relative z-10">
                  <motion.div
                    whileHover={{ rotate: 5, scale: 1.1 }}
                    transition={{ type: "spring", stiffness: 300 }}
                    className="w-12 h-12 rounded-xl bg-muted/50 flex items-center justify-center mb-5 border border-border/50 shadow-[inset_0_1px_0_hsl(0_0%_100%/0.06)]"
                  >
                    <feature.icon className={`w-6 h-6 ${feature.accentColor}`} />
                  </motion.div>
                  <h3 className={`text-xl font-semibold mb-3 ${feature.accentColor}`}>
                    {feature.title}
                  </h3>
                  <p className="text-muted-foreground text-sm leading-relaxed">
                    {feature.description}
                  </p>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="py-24 px-4 relative z-10">
        <div className="container mx-auto">
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            whileInView={{ opacity: 1, scale: 1, y: 0 }}
            viewport={{ once: true, margin: "-100px" }}
            transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
            className="max-w-3xl mx-auto skeuo-card skeuo-highlight grain-texture rounded-3xl p-12 lg:p-16 text-center relative overflow-hidden"
          >
            {/* Animated inner glow */}
            <motion.div
              animate={{ opacity: [0.3, 0.6, 0.3] }}
              transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
              className="absolute inset-0 bg-gradient-to-b from-primary/5 to-transparent rounded-3xl pointer-events-none"
            />
            
            <h2 className="text-4xl lg:text-5xl font-bold mb-4 relative z-10">
              <span className="text-foreground">Ready to </span>
              <span className="bg-gradient-neon bg-clip-text text-transparent">Stand Out</span>
              <span className="text-foreground">?</span>
            </h2>
            <p className="text-lg text-muted-foreground mb-10 max-w-xl mx-auto relative z-10">
              Join thousands of job seekers who have elevated their resumes with Tailor
            </p>
            <motion.div whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.97 }} className="relative z-10">
              <Button
                size="lg"
                onClick={() => navigate("/auth")}
                variant="neon"
                className="text-base px-10 py-6 h-auto group"
              >
                Start Tailoring Now
                <ArrowRight className="ml-2 w-5 h-5 group-hover:translate-x-1 transition-transform" />
              </Button>
            </motion.div>
          </motion.div>
        </div>
      </section>
    </div>
  );
};

export default Index;
