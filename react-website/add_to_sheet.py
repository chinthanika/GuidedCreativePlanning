import os
import pandas as pd

# === SETTINGS ===
INPUT_FOLDER = 'word_documents'
OUTPUT_EXCEL = 'document_list.xlsx'
GROUP_LABEL = 'experimental'

# === GET LIST OF .docx FILES ===
files = [f for f in os.listdir(INPUT_FOLDER) if f.endswith('.docx')]

# === CREATE DATAFRAME ===
data = {
    'file': files,
    'group': [GROUP_LABEL] * len(files)
}
df = pd.DataFrame(data)

# === SAVE TO EXCEL ===
df.to_excel(OUTPUT_EXCEL, index=False)
print(f"[SAVED] Excel file created: {OUTPUT_EXCEL}")
