import re
file_path = "app/routes/api.py"

with open(file_path, "r", encoding="utf-8") as f:
    content = f.read()

# Add endpoints to api.py
new_endpoints = """
@router.get(
    "/detect-categories",
    summary="Detect BlackBox categories",
    description="Returns a list of unique categories found in the uploaded BlackBox dataset.",
)
def detect_categories():
    logger.info("Detecting categories")
    if not registry.is_blackbox_loaded() and not getattr(registry, "_original_blackbox", None) is not None:
        return format_response({
            "status": "error",
            "message": "BlackBox dataset not loaded."
        })
    res = registry.get_detected_categories()
    return format_response(res)

from pydantic import BaseModel
class SetCategoryRequest(BaseModel):
    categories: list[str]

@router.post(
    "/set-category",
    summary="Set active categories",
    description="Filters the BlackBox dataset to the selected categories and clears cache.",
)
def set_category(req: SetCategoryRequest):
    logger.info(f"Setting category to: {req.categories}")
    res = registry.set_category(req.categories)
    # clear cache so engines recalculate with new dataset
    from app.services.analysis_cache import analysis_cache
    analysis_cache.clear()
    return format_response(res)
"""

# Insert them after get_status
status_idx = content.find("def get_status():")
if status_idx != -1:
    end_of_status = content.find("def upload_datasets(", status_idx)
    end_of_status = content.rfind("@router.post", status_idx, end_of_status)
    
    content = content[:end_of_status] + new_endpoints + "\n\n" + content[end_of_status:]

with open(file_path, "w", encoding="utf-8") as f:
    f.write(content)
