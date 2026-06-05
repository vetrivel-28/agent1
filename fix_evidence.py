import re
file_path = "market_intelligence_dashboard/src/components/ui/EvidenceDrawer.tsx"
with open(file_path, "r", encoding="utf-8") as f:
    content = f.read()

# Force calculation_scope display
scope_old = """                  {evidence.calculation_scope && (
                    <div className="pt-2 border-t border-border/40">
                      <p className="text-xs text-muted-foreground mb-1 font-medium">Calculation Scope</p>
                      <span className={cn(
                        "inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-semibold",
                        evidence.calculation_scope === 'Filtered' ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"
                      )}>
                        {evidence.calculation_scope}
                      </span>
                    </div>
                  )}"""

scope_new = """                  <div className="pt-2 border-t border-border/40">
                    <p className="text-xs text-muted-foreground mb-1 font-medium">Calculation Scope</p>
                    <span className={cn(
                      "inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-semibold",
                      (evidence.calculation_scope === 'Filtered' || !evidence.calculation_scope) ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"
                    )}>
                      Filtered BlackBox dataset
                    </span>
                  </div>"""

content = content.replace(scope_old, scope_new)
with open(file_path, "w", encoding="utf-8") as f:
    f.write(content)
