import os
import pandas as pd
import numpy as np

os.makedirs("datasets", exist_ok=True)

# Create Magnet dummy data
magnet_size = 100
magnet_data = {
    "Keyword Phrase": [f"keyword {i}" for i in range(magnet_size)],
    "Search Volume": np.random.randint(100, 10000, size=magnet_size),
    "CPR": np.random.uniform(0.5, 2.5, size=magnet_size),
    "Sponsored ASINs": np.random.randint(10, 500, size=magnet_size),
    "Competing Products": np.random.randint(100, 10000, size=magnet_size),
    "Title Density": np.random.uniform(5, 100, size=magnet_size),
    "H10 PPC Sugg. Bid": np.random.uniform(0.25, 5.0, size=magnet_size),
}
magnet_df = pd.DataFrame(magnet_data)
magnet_df.to_csv("datasets/Magnet_Bamboo Towel.csv", index=False)
print("Created datasets/Magnet_Bamboo Towel.csv")

# Create BlackBox dummy data
bb_size = 100
bb_data = {
    "Title": [f"Product {i}" for i in range(bb_size)],
    "Price": np.random.uniform(10, 50, size=bb_size),
    "Monthly Revenue": np.random.uniform(1000, 100000, size=bb_size),
    "Review Count": np.random.randint(10, 50000, size=bb_size),
    "Parent Revenue": np.random.uniform(1000, 1000000, size=bb_size),
    "Parent Level Revenue": np.random.uniform(1000, 1000000, size=bb_size),
    "BSR": np.random.randint(1, 100000, size=bb_size),
    "Sellers": np.random.randint(1, 10, size=bb_size),
    "Active Sellers": np.random.randint(1, 10, size=bb_size),
    "Storage Fee Jan-Sep": np.random.uniform(0.5, 5, size=bb_size),
    "Storage Fee Oct-Dec": np.random.uniform(1, 10, size=bb_size),
}
bb_df = pd.DataFrame(bb_data)
bb_df.to_csv("datasets/BlackBox_Products_Bamboo Towel.csv", index=False)
print("Created datasets/BlackBox_Products_Bamboo Towel.csv")
