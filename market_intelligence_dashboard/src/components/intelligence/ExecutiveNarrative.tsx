import React from 'react';
import { motion } from 'framer-motion';
import { Lightbulb } from 'lucide-react';

interface ExecutiveNarrativeProps {
  content: string | React.ReactNode;
}

export function ExecutiveNarrative({ content }: ExecutiveNarrativeProps) {
  // Removed per design spec — executive narrative blocks are not displayed
  return null;
}
