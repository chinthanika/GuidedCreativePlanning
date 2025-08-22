import firebase_admin
from firebase_admin import credentials, db
from docx import Document
import os
import json

# === CONFIGURATION ===
SERVICE_ACCOUNT_KEY_PATH = 'src/Firebase/structuredcreativeplanning-firebase-adminsdk-y05ga-29db951c0a.json'
DATABASE_URL = 'https://structuredcreativeplanning-default-rtdb.firebaseio.com/'
OUTPUT_DIR = 'word_documents'

# === INITIALIZE FIREBASE ADMIN FOR REALTIME DATABASE ===
cred = credentials.Certificate(SERVICE_ACCOUNT_KEY_PATH)
firebase_admin.initialize_app(cred, {
    'databaseURL': DATABASE_URL
})

# === FUNCTION TO CONVERT STORY STRUCTURE TO PARAGRAPHS ===
def extract_text_from_story(content):
    paragraphs = []
    for block in content:
        if isinstance(block, dict) and block.get('type') == 'paragraph':
            paragraph_text = ''.join(
                child.get('text', '') for child in block.get('children', []) if isinstance(child, dict)
            )
            paragraphs.append(paragraph_text)
        elif isinstance(block, str):
            paragraphs.append(block)
        else:
            print(f"[WARNING] Skipping malformed block: {block}")
    return paragraphs

# === CREATE OUTPUT FOLDER ===
os.makedirs(OUTPUT_DIR, exist_ok=True)

# === GET ALL USER IDs UNDER "stories" ===
print('running...')
stories_ref = db.reference('stories')
all_users_data = stories_ref.get()

if all_users_data:
    for user_id, user_data in all_users_data.items():
        story_raw = user_data.get('story-text', {}).get('content', '')
        
        if not story_raw:
            print(f"[SKIPPED] No content for user: {user_id}")
            continue
        
        # Parse JSON string if needed
        if isinstance(story_raw, str):
            try:
                story_content = json.loads(story_raw)
            except json.JSONDecodeError as e:
                print(f"[ERROR] JSON decode failed for user {user_id}: {e}")
                continue
        else:
            story_content = story_raw  # Already a parsed list

        # Extract paragraphs
        paragraphs = extract_text_from_story(story_content)

        # Create and save Word document
        docx = Document()
        for para in paragraphs:
            docx.add_paragraph(para)

        output_path = os.path.join(OUTPUT_DIR, f'{user_id}.docx')
        docx.save(output_path)
        print(f"[SAVED] Word document for {user_id}: {output_path}")
else:
    print("No stories found in the database.")