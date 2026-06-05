import pandas as pd
from app.engines import siei_engine

magnet_df = pd.DataFrame({
    "Keyword Phrase": ["test kw 1", "test kw 2", "test kw 3", "test kw 4"],
    "Search Volume": [1000, 2000, 3000, 4000],
    "Keyword Sales": [100, 20, 300, 40]
})

try:
    result = siei_engine.run(magnet_df, top_n=300)
    print("Status:", result["status"])
    if result["status"] == "error":
        print("Error:", result.get("message"))
    else:
        print("Success! Summary:", result.get("summary"))
except Exception as e:
    import traceback
    traceback.print_exc()
