import re
file_path = "market_intelligence_dashboard/src/components/layout/Topbar.tsx"

with open(file_path, "r", encoding="utf-8") as f:
    content = f.read()

# Add getStatus useQuery and navigate
hooks_new = """  const { data: health, isLoading, isError } = useQuery({
    queryKey: ['health'],
    queryFn: api.getHealth,
    refetchInterval: 30000, // Check every 30s
  });

  const { data: statusData } = useQuery({
    queryKey: ['status'],
    queryFn: api.getStatus,
    refetchInterval: 10000,
  });

  const navigate = require('react-router-dom').useNavigate();
"""

content = content.replace("""  const { data: health, isLoading, isError } = useQuery({
    queryKey: ['health'],
    queryFn: api.getHealth,
    refetchInterval: 30000, // Check every 30s
  });""", hooks_new)

# Add category UI
category_ui = """            {statusData?.data?.metadata?.blackbox?.selected_categories?.length > 0 && (
              <div className="flex items-center gap-3 mr-4 border-r pr-4 border-border">
                <div className="flex flex-col text-right">
                  <span className="text-xs text-muted-foreground uppercase tracking-widest font-bold">Active Category</span>
                  <span className="text-sm font-bold text-foreground">
                    {statusData.data.metadata.blackbox.selected_categories.length > 1 
                      ? ${statusData.data.metadata.blackbox.selected_categories.length} Selected
                      : statusData.data.metadata.blackbox.selected_categories[0]}
                  </span>
                </div>
                <div className="flex flex-col text-right">
                  <span className="text-[10px] text-muted-foreground">Products</span>
                  <span className="text-[11px] font-mono text-emerald-500">
                    {statusData.data.metadata.blackbox.filtered_rows} of {statusData.data.metadata.blackbox.original_rows}
                  </span>
                </div>
                <Button variant="outline" size="sm" className="h-7 text-xs ml-2" onClick={() => navigate('/upload')}>
                  Change
                </Button>
              </div>
            )}
            
            <div className="flex items-center gap-2 text-sm text-muted-foreground mr-4">"""

content = content.replace('            <div className="flex items-center gap-2 text-sm text-muted-foreground mr-4">', category_ui)

with open(file_path, "w", encoding="utf-8") as f:
    f.write(content)
