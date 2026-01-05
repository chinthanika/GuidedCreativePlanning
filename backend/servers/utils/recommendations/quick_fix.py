"""
Quick fix script to ensure curated_collections.json is in the right place
and has the correct format.
"""

import os
import json
import shutil

def main():
    print("=" * 60)
    print("CURATED COLLECTIONS - QUICK FIX")
    print("=" * 60)
    
    # Define source and target paths
    source = "utils/recommendations/data/curated_collections.json"
    targets = [
        "utils/recommendations/curated_collections.json",  # Primary fallback location
        "data/curated_collections.json"  # Alternative location
    ]
    
    # Check if source exists
    if not os.path.exists(source):
        print(f"✗ Source file not found: {source}")
        print("\nCreating default collections file...")
        
        # Create default collections
        default_collections = {
            "coming_of_age": [
                {
                    "id": "coa_1",
                    "title": "The Perks of Being a Wallflower",
                    "author": "Stephen Chbosky",
                    "year": 1999,
                    "rating": 4.2,
                    "coverUrl": "https://covers.openlibrary.org/b/id/8235937-L.jpg",
                    "description": "A coming-of-age story about friendship, self-discovery, and finding your place in the world.",
                    "categories": ["Contemporary", "Young Adult", "Coming of Age"]
                }
            ],
            "fantasy_worldbuilding": [
                {
                    "id": "fbx_1",
                    "title": "The Name of the Wind",
                    "author": "Patrick Rothfuss",
                    "year": 2007,
                    "rating": 4.5,
                    "coverUrl": "https://covers.openlibrary.org/b/id/8235937-L.jpg",
                    "description": "A legendary hero tells his own story in a richly detailed fantasy world with complex magic.",
                    "categories": ["Fantasy", "Young Adult", "Magic"]
                }
            ],
            "dystopian": [
                {
                    "id": "dys_1",
                    "title": "The Hunger Games",
                    "author": "Suzanne Collins",
                    "year": 2008,
                    "rating": 4.3,
                    "coverUrl": "https://covers.openlibrary.org/b/id/7833604-L.jpg",
                    "description": "A girl fights for survival in a brutal televised competition in a dystopian future.",
                    "categories": ["Dystopian", "Young Adult", "Action"]
                }
            ],
            "unreliable_narrators": [
                {
                    "id": "un_1",
                    "title": "We Were Liars",
                    "author": "E. Lockhart",
                    "year": 2014,
                    "rating": 3.8,
                    "coverUrl": "https://covers.openlibrary.org/b/id/8235937-L.jpg",
                    "description": "A mysterious story with an unreliable narrator and shocking revelations.",
                    "categories": ["Mystery", "Young Adult", "Thriller"]
                }
            ],
            "character_driven": [
                {
                    "id": "cd_1",
                    "title": "The Fault in Our Stars",
                    "author": "John Green",
                    "year": 2012,
                    "rating": 4.3,
                    "coverUrl": "https://covers.openlibrary.org/b/id/8235937-L.jpg",
                    "description": "A deeply emotional character-driven story about two teenagers facing illness.",
                    "categories": ["Contemporary", "Young Adult", "Romance"]
                }
            ]
        }
        
        # Ensure directories exist
        os.makedirs(os.path.dirname(source), exist_ok=True)
        
        # Write default collections to source
        with open(source, 'w', encoding='utf-8') as f:
            json.dump(default_collections, f, indent=2)
        
        print(f"✓ Created default collections at: {source}")
    else:
        print(f"✓ Source file found: {source}")
        
        # Validate JSON
        try:
            with open(source, 'r', encoding='utf-8') as f:
                data = json.load(f)
                print(f"  Collections: {list(data.keys())}")
                print(f"  Total books: {sum(len(v) for v in data.values())}")
        except Exception as e:
            print(f"✗ Failed to parse source JSON: {e}")
            return
    
    # Copy to target locations
    print("\nCopying to fallback locations...")
    for target in targets:
        try:
            # Create directory if needed
            target_dir = os.path.dirname(target)
            if target_dir:
                os.makedirs(target_dir, exist_ok=True)
            
            # Copy file
            shutil.copy2(source, target)
            print(f"✓ Copied to: {target}")
        except Exception as e:
            print(f"✗ Failed to copy to {target}: {e}")
    
    print("\n" + "=" * 60)
    print("✓ DONE")
    print("=" * 60)
    print("\nYou can now start the server:")
    print("  python ai_server.py")
    print("\nOr run verification:")
    print("  python verify_book_recs_setup.py")

if __name__ == "__main__":
    main()