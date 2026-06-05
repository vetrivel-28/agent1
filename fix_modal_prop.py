import re
file_path = "market_intelligence_dashboard/src/pages/DatasetUpload.tsx"
with open(file_path, "r", encoding="utf-8") as f:
    content = f.read()

modal_old = """        <Modal
          isOpen={categoryModal.isOpen}
          onClose={() => {}}
          title="Select Market Category"
          description={Your BlackBox dataset contains multiple product categories. Select the category you want to analyze before calculations begin. Detected from: }
          maxWidth="max-w-2xl"
        >
          <div className="space-y-4 max-h-[60vh] overflow-y-auto p-1">"""

modal_new = """        <Modal
          isOpen={categoryModal.isOpen}
          onClose={() => {}}
          title="Select Market Category"
          maxWidth="max-w-2xl"
        >
          <p className="text-sm text-muted-foreground mb-4">
            Your BlackBox dataset contains multiple product categories. Select the category you want to analyze before calculations begin. Detected from: {categoryModal.columnName}
          </p>
          <div className="space-y-4 max-h-[60vh] overflow-y-auto p-1">"""

content = content.replace(modal_old, modal_new)
with open(file_path, "w", encoding="utf-8") as f:
    f.write(content)
