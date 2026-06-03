import React from 'react';
import { motion } from 'framer-motion';
import { Lightbulb } from 'lucide-react';

interface ExecutiveNarrativeProps {
  content: string | React.ReactNode;
}

export function ExecutiveNarrative({ content }: ExecutiveNarrativeProps) {
  if (!content) return null;
  
  return (
    <motion.div 
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.1, ease: [0.25, 0.46, 0.45, 0.94] }}
      className="p-6 bg-primary/5 border border-primary/20 rounded-xl mb-12 glass-card relative overflow-hidden"
    >
      <div className="absolute top-0 left-0 w-1 h-full bg-primary" />
      <div className="flex items-start gap-4">
        <div className="p-2 bg-primary/10 rounded-lg shrink-0">
          <Lightbulb className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h3 className="text-sm font-bold uppercase tracking-widest text-primary mb-2">Executive Narrative</h3>
          <p className="text-body text-foreground/90 font-medium leading-relaxed italic">
            "{content}"
          </p>
        </div>
      </div>
    </motion.div>
  );
}
