"""
Diagnostic script to find and verify curated_collections.json location.
Run this from the backend/servers directory.
"""

import os
import json
import sys

print("=" * 60)
print("CURATED COLLECTIONS DIAGNOSTIC")
print("=" * 60)

# Current working directory
cwd = os.getcwd()
print(f"\nCurrent directory: {cwd}")

# Check if we're in the right place
if not os.path.exists('ai_server.py'):
    print("\n⚠️  WARNING: ai_server.py not found in current directory")
    print("   Make sure you run this from backend/servers/")
    print(f"   Current: {cwd}")
    sys.exit(1)

print("✓ Found ai_server.py")

# Possible locations
possible_paths = [
    'curated_collections.json',
    'data/curated_collections.json',
    '../data/curated_collections.json',
    'utils/recommendations/curated_collections.json',
    'utils/recommendations/data/curated_collections.json',
    'utils/curated_collections.json',
]

print("\n" + "=" * 60)
print("SEARCHING FOR curated_collections.json")
print("=" * 60)

found_files = []

for path in possible_paths:
    full_path = os.path.abspath(path)
    exists = os.path.exists(path)
    
    if exists:
        print(f"✓ FOUND: {path}")
        print(f"  Full path: {full_path}")
        found_files.append(path)
        
        # Try to load and validate
        try:
            with open(path, 'r', encoding='utf-8') as f:
                data = json.load(f)
            
            if isinstance(data, dict):
                keys = list(data.keys())
                total_books = sum(len(v) for v in data.values() if isinstance(v, list))
                print(f"  Collections: {', '.join(keys)}")
                print(f"  Total books: {total_books}")
                
                # Check for correct format
                expected_keys = ['coming_of_age', 'fantasy_worldbuilding', 'dystopian', 
                               'unreliable_narrators', 'character_driven']
                missing_keys = [k for k in expected_keys if k not in keys]
                
                if missing_keys:
                    print(f"  ⚠️  Missing collections: {', '.join(missing_keys)}")
                else:
                    print(f"  ✓ All expected collections present")
            else:
                print(f"  ✗ Invalid format (not a dict)")
                
        except json.JSONDecodeError as e:
            print(f"  ✗ Invalid JSON: {e}")
        except Exception as e:
            print(f"  ✗ Error reading file: {e}")
    else:
        print(f"✗ NOT FOUND: {path}")

print("\n" + "=" * 60)
print("SUMMARY")
print("=" * 60)

if found_files:
    print(f"\n✓ Found {len(found_files)} file(s):")
    for f in found_files:
        print(f"  - {f}")
    
    print("\n📝 RECOMMENDATION:")
    recommended = found_files[0]
    print(f"   Use this path: {recommended}")
    print(f"   Full path: {os.path.abspath(recommended)}")
else:
    print("\n✗ No curated_collections.json found!")
    print("\n📝 ACTION REQUIRED:")
    print("   1. Create the file at: data/curated_collections.json")
    print("   2. Use the JSON content from the artifact 'curated_collections.json'")
    print("\n   Quick command:")
    print("   mkdir -p data")
    print("   # Then copy the JSON content to data/curated_collections.json")

# Check where BookSourceManager looks
print("\n" + "=" * 60)
print("CHECKING BookSourceManager")
print("=" * 60)

try:
    sys.path.insert(0, 'utils/recommendations')
    from utils.recommendations.book_sources import BookSourceManager
    
    print("\nInitializing BookSourceManager...")
    manager = BookSourceManager()
    
    if manager.curated_collections:
        print(f"✓ Manager loaded {len(manager.curated_collections)} collections")
        for key, books in manager.curated_collections.items():
            print(f"  - {key}: {len(books)} books")
    else:
        print("✗ Manager has no collections loaded")
        print("  This means the file wasn't found or failed to load")
        
except ImportError as e:
    print(f"✗ Cannot import BookSourceManager: {e}")
except Exception as e:
    print(f"✗ Error initializing manager: {e}")

print("\n" + "=" * 60)
print("NEXT STEPS")
print("=" * 60)

if not found_files:
    print("""
1. Create directory structure:
   mkdir -p data

2. Create data/curated_collections.json with this content:
   {
     "coming_of_age": [...],
     "fantasy_worldbuilding": [...],
     "dystopian": [...],
     "unreliable_narrators": [...],
     "character_driven": [...]
   }

3. Use the complete JSON from the artifact 'curated_collections.json'

4. Restart your Flask server:
   python app.py

5. Re-run tests:
   python test_recommendations_v2.py
""")
else:
    print("""
✓ File exists! If tests still fail:

1. Check app.py imports book_source_manager correctly
2. Restart Flask server to reload the file
3. Check logs/recommendations.log for loading errors
""")