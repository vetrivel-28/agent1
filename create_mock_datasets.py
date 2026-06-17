import pandas as pd
import numpy as np

def create_blackbox():
    data = {
        "ASIN": ["B001", "B002", "B003"],
        "Title": ["Skincare Cream", "Face Wash", "Body Lotion"],
        "Price": [19.99, 14.99, 24.99],
        "category": ["Skincare", "Skincare", "Skincare"],
        "BSR": [100, 200, 300],
        "Revenue": [5000, 4000, 3000],
        "Brand": ["BrandA", "BrandB", "BrandC"]
    }
    df = pd.DataFrame(data)
    df.to_csv("blackbox.csv", index=False)

def create_magnet():
    data = {
        "Keyword Phrase": ["skincare cream", "face wash", "body lotion"],
        "Search Volume": [10000, 8000, 6000]
    }
    df = pd.DataFrame(data)
    df.to_csv("magnet.csv", index=False)

if __name__ == "__main__":
    create_blackbox()
    create_magnet()
    print("Created mock datasets.")
