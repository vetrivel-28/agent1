import re
import os

file_path = "market_intelligence_dashboard/src/pages/FinanceIntelligence.tsx"
with open(file_path, "r", encoding="utf-8") as f:
    content = f.read()

# 1. Remove Market Risk card from the grid
risk_card_pattern = r"        <KpiCard\s+title=\{riskIsInverse \? 'Market Risk \(Inverse\)' : 'Market Risk'\}.*?/>"
content = re.sub(risk_card_pattern, "", content, flags=re.DOTALL)

# 2. Remove Market Risk from top-right header
header_risk_pattern = r"""          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-1">Risk Gauge</p>
            <p className=\{cn\('text-3xl font-black font-mono', marketRiskScore <= 40 \? 'text-emerald-500' : 'text-red-500'\)\}>
              \{marketRiskScore\.toFixed\(0\)\}
            </p>
          </div>"""
content = re.sub(header_risk_pattern, "", content, flags=re.DOTALL)

# 3. Update maEvidenceBlock (Market Attractiveness) to use evidence dictionary properly
old_ma_evidence = r"""  const maEvidenceBlock: MetricBlock = \{
    status: healthOk \? 'success' : 'insufficient_data',
    score: marketAttractivenessScore,
    classification: marketAttractivenessLabel,
    formula_used: \(
      "Market Attractiveness = 0\.25×\(100 − Advertising Pressure\) \+ 0\.20×Price Positioning Potential \+ " \+
      "0\.25×\(100 − Margin Compression\) \+ 0\.15×Capital Efficiency \+ 0\.15×\(100 − Entry Difficulty\)\. " \+
      "Components are inverted where higher score = more difficulty\. Missing components excluded with weight re-normalization\."
    \),
    columns_used: Object\.values\(results\)\.flatMap\(\(v: any\) => \(v && v\.columns_used\) \? v\.columns_used : \[\]\),
    component_scores: \{
      \.\.\.\(apiOk \? \{ 'Advertising Pressure \(inverted\)': 100 - apiScore! \} : \{\}\),
      \.\.\.\(pvsOk \? \{ 'Price Positioning Potential': pvsScore! \} : \{\}\),
      \.\.\.\(edOk \? \{ 'Entry Difficulty \(inverted\)': 100 - edScore! \} : \{\}\),
    \},
    evidence: \{\},
  \};"""

new_ma_evidence = """  const maEvidenceBlock: MetricBlock = {
    status: healthOk ? 'success' : 'insufficient_data',
    score: marketAttractivenessScore,
    classification: marketAttractivenessLabel,
    formula_used: (
      "Market Attractiveness = Advertising Efficiency × weight + Price Positioning × weight + " +
      "Margin Compression × weight + Capital Efficiency × weight + Entry Accessibility × weight. " +
      "Missing components are excluded and weights are proportionally rebalanced."
    ),
    columns_used: Object.values(results).flatMap((v: any) => (v && v.columns_used) ? v.columns_used : []),
    evidence: {
      ...(apiOk ? {
        'Advertising Efficiency (Inverse)': {
          column: 'H10 PPC Sugg. Bid, Sponsored ASINs',
          avg_value: apiScore!,
          normalized_score: 100 - apiScore!,
          weight: 0.25,
          interpretation: '100 - Advertising Pressure. Higher score = less advertising pressure.'
        }
      } : {}),
      ...(pvsOk ? {
        'Price Positioning Potential': {
          column: 'Price, Revenue',
          avg_value: pvsScore!,
          normalized_score: pvsScore!,
          weight: 0.20,
          interpretation: 'Direct score. Higher score = better premium positioning.'
        }
      } : {}),
      ...(edOk ? {
        'Entry Accessibility (Inverse)': {
          column: 'CPR, Reviews, Title Density',
          avg_value: edScore!,
          normalized_score: 100 - edScore!,
          weight: 0.15,
          interpretation: '100 - Entry Difficulty. Higher score = easier entry.'
        }
      } : {}),
    },
  };"""
content = content.replace(old_ma_evidence, new_ma_evidence)

# 4. MatrixExplanationDrawer update
matrix_drawer_old = r"""          <div className="grid grid-cols-2 gap-3">
            <div className=\{cn\('p-4 rounded-xl border', highDemand \? 'border-emerald-500/30 bg-emerald-500/5' : 'border-red-500/30 bg-red-500/5'\)\}>
              <p className="text-xs text-muted-foreground uppercase tracking-wide">Demand Strength</p>
              <p className="text-2xl font-black font-mono mt-1">\{data\.demand_strength\.toFixed\(1\)\}</p>
              <p className=\{cn\('text-xs font-semibold mt-1', highDemand \? 'text-emerald-500' : 'text-red-500'\)\}>
                \{highDemand \? `≥ \$\{threshold\} threshold → High` : `< \$\{threshold\} threshold → Low`\}
              </p>
            </div>
            <div className=\{cn\('p-4 rounded-xl border', highFinance \? 'border-emerald-500/30 bg-emerald-500/5' : 'border-red-500/30 bg-red-500/5'\)\}>
              <p className="text-xs text-muted-foreground uppercase tracking-wide">Market Health</p>
              <p className="text-2xl font-black font-mono mt-1">\{data\.finance_health\.toFixed\(1\)\}</p>
              <p className=\{cn\('text-xs font-semibold mt-1', highFinance \? 'text-emerald-500' : 'text-red-500'\)\}>
                \{highFinance \? `≥ \$\{threshold\} threshold → Strong` : `< \$\{threshold\} threshold → Weak`\}
              </p>
            </div>
          </div>"""

matrix_drawer_new = """          <div className="grid grid-cols-2 gap-3">
            <div className={cn('p-4 rounded-xl border', highDemand ? 'border-emerald-500/30 bg-emerald-500/5' : 'border-red-500/30 bg-red-500/5')}>
              <p className="text-xs text-muted-foreground uppercase tracking-wide">Demand Strength</p>
              <p className="text-2xl font-black font-mono mt-1">{data.demand_strength.toFixed(1)}/100</p>
              <p className={cn('text-xs font-semibold mt-1 mb-2', highDemand ? 'text-emerald-500' : 'text-red-500')}>
                {highDemand ? `≥ ${threshold} threshold → High` : `< ${threshold} threshold → Low`}
              </p>
              <div className="text-[10px] text-muted-foreground space-y-1">
                <p><strong>Source:</strong> Magnet Dataset (Search Volume, Keyword Sales, ASIN Sales, Revenue)</p>
                <p><strong>Method:</strong> Log-normalized weighted sum to prevent extreme skew from top keywords.</p>
              </div>
            </div>
            <div className={cn('p-4 rounded-xl border', highFinance ? 'border-emerald-500/30 bg-emerald-500/5' : 'border-red-500/30 bg-red-500/5')}>
              <p className="text-xs text-muted-foreground uppercase tracking-wide">Market Health (Attractiveness)</p>
              <p className="text-2xl font-black font-mono mt-1">{data.finance_health.toFixed(1)}/100</p>
              <p className={cn('text-xs font-semibold mt-1 mb-2', highFinance ? 'text-emerald-500' : 'text-red-500')}>
                {highFinance ? `≥ ${threshold} threshold → Strong` : `< ${threshold} threshold → Weak`}
              </p>
              <div className="text-[10px] text-muted-foreground space-y-1">
                <p><strong>Source:</strong> Composite Score (Advertising, Pricing, Entry, Margin)</p>
              </div>
            </div>
          </div>"""
content = content.replace(matrix_drawer_old, matrix_drawer_new)

# 5. Price Positioning Potential Update inside PVS block logic
pvs_block_old = r"""  const pvs_data = \(results\.premium_viability \|\| \{\}\) as MetricBlock;"""
pvs_block_new = """  const pvs_data = (results.premium_viability || {}) as MetricBlock;
  if (pvs_data && pvs_data.status === 'success') {
      const pvs_heatmap = (results.premium_viability as any).price_elasticity_heatmap || [];
      const q1 = pvs_heatmap[0];
      const q4 = pvs_heatmap[3];
      if (q1 && q4) {
          pvs_data.evidence = {
            'Q4 Revenue Share (High Price)': {
               column: 'Price / Revenue',
               avg_value: q4.revenue_share,
               normalized_score: q4.revenue_share,
               weight: 0.5,
               interpretation: `Top quartile price range (${q4.price_band}) revenue share`
            },
            'Q1 Revenue Share (Low Price)': {
               column: 'Price / Revenue',
               avg_value: q1.revenue_share,
               normalized_score: q1.revenue_share,
               weight: 0.5,
               interpretation: `Bottom quartile price range (${q1.price_band}) revenue share`
            }
          };
          
          if (pvs_data.score === 50) {
              pvs_data.mini_insight = "50 means balanced pricing. Higher-priced products are not clearly outperforming or underperforming lower-priced products.";
          }
      }
  }
"""
content = content.replace(pvs_block_old, pvs_block_new)

with open(file_path, "w", encoding="utf-8") as f:
    f.write(content)
print("Updated FinanceIntelligence.tsx successfully.")
