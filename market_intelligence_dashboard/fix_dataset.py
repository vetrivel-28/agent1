import re
file_path = "src/hooks/useDatasetFilters.ts"
with open(file_path, "r", encoding="utf-8") as f:
    content = f.read()

content = content.replace("dataset.forEach", "safeDataset.forEach")
content = content.replace("return dataset;", "return safeDataset;")
content = content.replace("dataset.filter", "safeDataset.filter")
content = content.replace("[dataset, configs]", "[safeDataset, configs]")
content = content.replace("[dataset, configs, activeFilters]", "[safeDataset, configs, activeFilters]")

with open(file_path, "w", encoding="utf-8") as f:
    f.write(content)
