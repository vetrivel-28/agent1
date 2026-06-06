/** Fixed 20-segment framework — names are constant; metrics are dataset-driven. */
export const FIXED_SEGMENT_NAMES = [
  'Budget Maximizers',
  'Premium Quality Seekers',
  'Convenience Buyers',
  'Brand Loyalists',
  'Deal Hunters',
  'Feature Researchers',
  'Risk-Averse Buyers',
  'Impulse Shoppers',
  'Trend Followers',
  'Practical Buyers',
  'Gift Buyers',
  'Heavy Users',
  'Occasional Users',
  'Sustainability Focused',
  'Status Seekers',
  'Value Maximizers',
  'Problem Solvers',
  'First-Time Buyers',
  'Category Experts',
  'Switchers',
] as const;

export type FixedSegmentName = (typeof FIXED_SEGMENT_NAMES)[number];
