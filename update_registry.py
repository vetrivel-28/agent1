import re
file_path = "app/services/dataset_registry.py"

with open(file_path, "r", encoding="utf-8") as f:
    content = f.read()

# Add _original_blackbox and _category fields
init_replacement = """    def __init__(self) -> None:
        self._blackbox: Optional[pd.DataFrame] = None
        self._original_blackbox: Optional[pd.DataFrame] = None
        self._magnet: Optional[pd.DataFrame] = None
        self._keyword_classification: Optional[pd.DataFrame] = None
        self._selected_category_column: str = ""
        self._selected_categories: list[str] = []

        # Metadata format: {"blackbox": {"rows": 100, "columns": [...], "timestamp": 12345, "sample": "Title"}}
        self._meta: Dict[str, Dict] = {
            "blackbox": {
                "rows": 0, 
                "columns": [], 
                "original_rows": 0,
                "filtered_rows": 0,
                "excluded_rows": 0,
                "selected_category_column": "",
                "selected_categories": []
            },"""
content = re.sub(r'    def __init__\(self\) -> None:.*?            "blackbox": {"rows": 0, "columns": \[\]},', init_replacement, content, flags=re.DOTALL)

# Update set_blackbox to keep original
set_blackbox_original = """    def set_blackbox(self, df: pd.DataFrame) -> None:
        self._blackbox = df.copy()"""
set_blackbox_new = """    def set_blackbox(self, df: pd.DataFrame) -> None:
        self._original_blackbox = df.copy()
        self._blackbox = df.copy()
        self._selected_category_column = ""
        self._selected_categories = []"""
content = content.replace(set_blackbox_original, set_blackbox_new)

# Update _meta inside set_blackbox
meta_original = """        self._meta["blackbox"] = {
            "rows": len(df),
            "columns": list(df.columns),
            "timestamp": int(time.time()),
            "sample_title": sample_title,
        }"""
meta_new = """        self._meta["blackbox"] = {
            "rows": len(df),
            "original_rows": len(df),
            "filtered_rows": len(df),
            "excluded_rows": 0,
            "columns": list(df.columns),
            "timestamp": int(time.time()),
            "sample_title": sample_title,
            "selected_category_column": "",
            "selected_categories": [],
        }"""
content = content.replace(meta_original, meta_new)

# Add get_detected_categories and set_category methods
new_methods = """
    # ------------------------------------------------------------------
    # Category Filtering
    # ------------------------------------------------------------------
    
    def get_detected_categories(self) -> dict:
        if self._original_blackbox is None or self._original_blackbox.empty:
            return {"status": "error", "message": "No BlackBox dataset loaded."}
            
        df = self._original_blackbox
        
        # Determine best category column
        cat_candidates = [
            "Category Path", "Full Category Path", "Category", 
            "Main Category", "Root Category", "Subcategory", "Product Type"
        ]
        cat_col = find_column(df, cat_candidates)
        
        if not cat_col:
            return {
                "status": "success",
                "has_categories": False,
                "column": None,
                "categories": []
            }
            
        # Group and count
        rev_col = find_column(df, ["Parent Level Revenue", "Revenue", "Monthly Revenue"])
        sales_col = find_column(df, ["Parent Level Sales", "Sales", "Monthly Sales", "Units"])
        
        # Fill NaN categories with "Uncategorized"
        cat_s = df[cat_col].fillna("Uncategorized")
        
        results = []
        unique_cats = cat_s.unique()
        
        for c in unique_cats:
            mask = cat_s == c
            sub_df = df[mask]
            
            # get 3 sample products
            title_col = find_column(sub_df, ["Title", "Product Title"])
            samples = []
            if title_col:
                samples = sub_df[title_col].dropna().head(3).tolist()
                
            rev = float(sub_df[rev_col].sum()) if rev_col else 0.0
            units = int(sub_df[sales_col].sum()) if sales_col else 0
            
            results.append({
                "category": str(c),
                "product_count": len(sub_df),
                "revenue": rev,
                "units_sold": units,
                "sample_products": samples
            })
            
        # Sort by product count descending
        results.sort(key=lambda x: x["product_count"], reverse=True)
        
        return {
            "status": "success",
            "has_categories": True,
            "column": cat_col,
            "categories": results
        }
        
    def set_category(self, categories: list[str]) -> dict:
        if self._original_blackbox is None or self._original_blackbox.empty:
            return {"status": "error", "message": "No BlackBox dataset loaded."}
            
        cat_info = self.get_detected_categories()
        if not cat_info.get("has_categories"):
            return {"status": "error", "message": "No category column available."}
            
        cat_col = cat_info["column"]
        self._selected_category_column = cat_col
        self._selected_categories = categories
        
        df = self._original_blackbox
        cat_s = df[cat_col].fillna("Uncategorized")
        
        # Filter
        mask = cat_s.isin(categories)
        filtered_df = df[mask]
        
        self._blackbox = filtered_df.copy()
        
        # Update meta
        orig_len = len(df)
        filt_len = len(filtered_df)
        self._meta["blackbox"]["rows"] = filt_len
        self._meta["blackbox"]["filtered_rows"] = filt_len
        self._meta["blackbox"]["excluded_rows"] = orig_len - filt_len
        self._meta["blackbox"]["selected_category_column"] = cat_col
        self._meta["blackbox"]["selected_categories"] = categories
        
        logger.info(f"Filtered BlackBox to categories: {categories}. Rows: {filt_len} (Excluded: {orig_len - filt_len})")
        
        return {
            "status": "success",
            "message": f"Category set to {categories}",
            "filtered_rows": filt_len,
            "excluded_rows": orig_len - filt_len
        }
"""

content = content.replace("    # ------------------------------------------------------------------\n    # Getters", new_methods + "\n    # ------------------------------------------------------------------\n    # Getters")

with open(file_path, "w", encoding="utf-8") as f:
    f.write(content)
