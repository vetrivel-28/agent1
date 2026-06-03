import React from 'react';
import { motion } from 'framer-motion';

interface PageSectionProps {
  title: string;
  icon?: React.ElementType;
  children: React.ReactNode;
  className?: string;
  id?: string;
}

export function PageSection({ title, icon: Icon, children, className = '', id }: PageSectionProps) {
  return (
    <motion.section 
      id={id}
      initial={{ opacity: 0, y: 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-100px" }}
      transition={{ duration: 0.4, ease: [0.25, 0.46, 0.45, 0.94] }}
      className={`space-y-6 mb-16 ${className}`}
    >
      <div className="flex items-center gap-2">
        {Icon && <Icon className="w-5 h-5 text-primary" />}
        <h2 className="text-section-title uppercase tracking-widest text-muted-foreground/80 text-sm">{title}</h2>
      </div>
      
      <div className="space-y-6">
        {children}
      </div>
    </motion.section>
  );
}
