import re
file_path = "market_intelligence_dashboard/src/services/api.ts"

with open(file_path, "r", encoding="utf-8") as f:
    content = f.read()

new_methods = """  detectCategories: async () => {
    const response = await apiClient.get('/detect-categories');
    return response.data;
  },

  setCategory: async (categories: string[]) => {
    const response = await apiClient.post('/set-category', { categories });
    return response.data;
  },

  uploadDatasets: async (formData: FormData) => {"""

content = content.replace("  uploadDatasets: async (formData: FormData) => {", new_methods)

with open(file_path, "w", encoding="utf-8") as f:
    f.write(content)
