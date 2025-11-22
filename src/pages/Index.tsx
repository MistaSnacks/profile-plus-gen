import { useEffect } from "react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { ArrowRight, Sparkles, Zap, Target } from "lucide-react";
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
    <div className="min-h-screen bg-gradient-subtle overflow-hidden relative">
      <ThreeBackground />
      
      {/* Dithering overlay */}
      <div className="fixed inset-0 pointer-events-none z-[100] dither-pattern opacity-60" />
      <div className="fixed inset-0 pointer-events-none z-[100] noise-texture" />
      
      {/* Hero Section */}
      <section className="relative min-h-screen flex items-center justify-center px-4 py-20">
        {/* Animated gradient orbs */}
        <motion.div 
          className="absolute top-20 left-10 w-96 h-96 bg-neon-pink/30 rounded-full blur-[100px]"
          animate={{
            scale: [1, 1.2, 1],
            opacity: [0.3, 0.6, 0.3],
          }}
          transition={{
            duration: 4,
            repeat: Infinity,
            ease: "easeInOut"
          }}
        />
        <motion.div 
          className="absolute bottom-20 right-10 w-96 h-96 bg-neon-cyan/30 rounded-full blur-[100px]"
          animate={{
            scale: [1.2, 1, 1.2],
            opacity: [0.3, 0.6, 0.3],
          }}
          transition={{
            duration: 5,
            repeat: Infinity,
            ease: "easeInOut",
            delay: 1
          }}
        />
        <motion.div 
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-neon-purple/20 rounded-full blur-[120px]"
          animate={{
            scale: [1, 1.3, 1],
            opacity: [0.2, 0.5, 0.2],
          }}
          transition={{
            duration: 6,
            repeat: Infinity,
            ease: "easeInOut",
            delay: 2
          }}
        />

        <div className="container mx-auto relative z-10">
          <div className="max-w-5xl mx-auto text-center space-y-12">
            {/* Badge */}
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6 }}
              className="inline-flex items-center gap-3 px-6 py-3 bg-card/50 backdrop-blur-sm rounded-full border-2 border-primary shadow-glow dither-strong"
            >
              <Sparkles className="w-5 h-5 text-neon-yellow animate-pulse" />
              <span className="text-sm font-bold text-foreground uppercase tracking-wider">
                AI-Powered Resume Evolution
              </span>
            </motion.div>

            {/* Main Title */}
            <motion.h1 
              initial={{ opacity: 0, y: 50 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, delay: 0.2 }}
              className="text-6xl lg:text-8xl font-black leading-tight"
            >
              <motion.span 
                className="block text-foreground"
                initial={{ opacity: 0, x: -50 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.6, delay: 0.3 }}
              >
                TAILOR YOUR
              </motion.span>
              <motion.span 
                className="block bg-gradient-neon bg-clip-text text-transparent neon-text text-7xl lg:text-9xl"
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.8, delay: 0.5 }}
              >
                RESUME
              </motion.span>
              <motion.span 
                className="block text-neon-cyan"
                initial={{ opacity: 0, x: 50 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.6, delay: 0.7 }}
              >
                TO PERFECTION
              </motion.span>
            </motion.h1>

            {/* Subtitle */}
            <motion.p
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, delay: 0.9 }}
              className="text-xl lg:text-2xl text-muted-foreground max-w-3xl mx-auto leading-relaxed font-medium"
            >
              Stop sending generic resumes. Our <span className="text-neon-pink font-bold">RAG-powered AI</span> analyzes 
              job descriptions and rewrites your resume to highlight the <span className="text-neon-cyan font-bold">perfect skills</span>—in seconds.
            </motion.p>

            {/* CTA Buttons */}
            <motion.div 
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, delay: 1.1 }}
              className="flex flex-wrap gap-6 justify-center items-center pt-8"
            >
              <Button
                size="lg"
                onClick={() => navigate("/auth")}
                className="group relative overflow-hidden"
              >
                GET STARTED FREE
                <ArrowRight className="w-5 h-5 ml-2 group-hover:translate-x-2 transition-transform" />
              </Button>
              <Button
                size="lg"
                variant="outline"
                onClick={() => navigate("/resumes")}
                className="group"
              >
                SEE HOW IT WORKS
                <Zap className="w-5 h-5 ml-2 group-hover:rotate-12 transition-transform" />
              </Button>
            </motion.div>

            {/* Features badges */}
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.8, delay: 1.3 }}
              className="flex flex-wrap gap-6 justify-center items-center pt-8"
            >
              <div className="flex items-center gap-2 text-sm font-bold text-neon-green">
                <div className="w-2 h-2 rounded-full bg-neon-green animate-pulse" />
                NO CREDIT CARD
              </div>
              <div className="flex items-center gap-2 text-sm font-bold text-neon-cyan">
                <div className="w-2 h-2 rounded-full bg-neon-cyan animate-pulse" />
                FREE FOREVER
              </div>
              <div className="flex items-center gap-2 text-sm font-bold text-neon-yellow">
                <div className="w-2 h-2 rounded-full bg-neon-yellow animate-pulse" />
                INSTANT RESULTS
              </div>
            </motion.div>
          </div>
        </div>

        {/* Floating icons */}
        <motion.div 
          className="absolute top-1/4 left-20 hidden lg:block"
          animate={{
            y: [-20, 20, -20],
            rotate: [-10, 10, -10]
          }}
          transition={{
            duration: 4,
            repeat: Infinity,
            ease: "easeInOut"
          }}
        >
          <div className="w-20 h-20 rounded-xl bg-gradient-primary shadow-glow flex items-center justify-center rotate-12 border-2 border-neon-pink dither-overlay">
            <Sparkles className="w-10 h-10 text-white" />
          </div>
        </motion.div>
        <motion.div 
          className="absolute top-1/3 right-20 hidden lg:block"
          animate={{
            y: [20, -20, 20],
            rotate: [10, -10, 10]
          }}
          transition={{
            duration: 5,
            repeat: Infinity,
            ease: "easeInOut",
            delay: 1
          }}
        >
          <div className="w-24 h-24 rounded-xl bg-gradient-secondary shadow-glow-cyan flex items-center justify-center -rotate-12 border-2 border-neon-cyan dither-overlay">
            <Zap className="w-12 h-12 text-background" />
          </div>
        </motion.div>
        <motion.div 
          className="absolute bottom-1/4 left-1/4 hidden lg:block"
          animate={{
            y: [-15, 15, -15],
            rotate: [45, 55, 45]
          }}
          transition={{
            duration: 3,
            repeat: Infinity,
            ease: "easeInOut",
            delay: 2
          }}
        >
          <div className="w-16 h-16 rounded-xl bg-gradient-accent shadow-glow-yellow flex items-center justify-center rotate-45 border-2 border-neon-yellow dither-overlay">
            <Target className="w-8 h-8 text-background" />
          </div>
        </motion.div>
      </section>

      {/* Features Grid */}
      <section className="py-32 px-4 relative">
        <div className="container mx-auto relative z-10">
          <motion.div 
            initial={{ opacity: 0, y: 50 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.8 }}
            className="text-center mb-20"
          >
            <h2 className="text-5xl lg:text-7xl font-black mb-6">
              <span className="text-foreground">WHY </span>
              <span className="bg-gradient-neon bg-clip-text text-transparent">TAILOR</span>
              <span className="text-foreground">?</span>
            </h2>
            <p className="text-xl text-muted-foreground">
              Powerful features designed to make you <span className="text-neon-pink font-bold">unstoppable</span>
            </p>
          </motion.div>

          <div className="grid md:grid-cols-3 gap-8 max-w-6xl mx-auto">
            {[
              {
                icon: Sparkles,
                title: "AI MATCHING",
                description: "Our AI analyzes job descriptions and optimizes your resume to match perfectly",
                color: "neon-pink",
                gradient: "gradient-primary",
              },
              {
                icon: Target,
                title: "ATS OPTIMIZED",
                description: "Boost your ATS score and get past automated screening systems",
                color: "neon-cyan",
                gradient: "gradient-secondary",
              },
              {
                icon: Zap,
                title: "INSTANT GEN",
                description: "Generate tailored resumes in seconds, not hours",
                color: "neon-yellow",
                gradient: "gradient-accent",
              },
            ].map((feature, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, y: 50 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.6, delay: index * 0.2 }}
                whileHover={{ scale: 1.05, y: -8 }}
                className="group relative bg-card/50 backdrop-blur-sm rounded-2xl p-8 border-2 border-border hover:border-primary transition-all duration-300 hover:shadow-glow overflow-hidden dither-strong"
              >
                <div className="relative z-10">
                  <div className={`w-16 h-16 rounded-xl bg-${feature.gradient} shadow-glow flex items-center justify-center mb-6 rotate-6 group-hover:rotate-12 transition-transform dither-overlay`}>
                    <feature.icon className="w-8 h-8 text-white" />
                  </div>
                  <h3 className={`text-2xl font-black mb-4 text-${feature.color} uppercase tracking-wider`}>
                    {feature.title}
                  </h3>
                  <p className="text-muted-foreground font-medium leading-relaxed">
                    {feature.description}
                  </p>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="py-32 px-4 relative">
        <motion.div 
          className="absolute inset-0 bg-gradient-hero opacity-50"
          animate={{
            scale: [1, 1.1, 1],
          }}
          transition={{
            duration: 10,
            repeat: Infinity,
            ease: "easeInOut"
          }}
        />
        <div className="container mx-auto relative z-10">
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 0.8 }}
            className="max-w-4xl mx-auto bg-card/50 backdrop-blur-sm rounded-3xl shadow-strong p-16 text-center border-4 border-primary dither-strong relative overflow-hidden"
          >
            {/* Scanlines effect */}
            <div className="absolute inset-0 scanlines pointer-events-none z-[1] opacity-30" />
            <h2 className="text-5xl lg:text-7xl font-black mb-6 relative z-10">
              <span className="text-foreground">READY TO</span>
              <br />
              <span className="bg-gradient-neon bg-clip-text text-transparent neon-text">DOMINATE</span>
              <br />
              <span className="text-neon-cyan">THE MARKET?</span>
            </h2>
            <p className="text-xl text-muted-foreground mb-12 max-w-2xl mx-auto font-medium relative z-10">
              Join thousands of job seekers who have <span className="text-neon-pink font-bold">leveled up</span> their resumes with TAILOR
            </p>
            <Button
              size="lg"
              onClick={() => navigate("/auth")}
              variant="neon"
              className="text-xl px-12 py-8 h-auto group relative z-10"
            >
              START TAILORING NOW
              <ArrowRight className="ml-3 w-6 h-6 group-hover:translate-x-3 transition-transform" />
            </Button>
          </motion.div>
        </div>
      </section>
    </div>
  );
};

export default Index;
