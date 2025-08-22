import os

def create_folder_structure_text(root_dir, output_file):
    with open(output_file, 'w') as f:
        for dirpath, dirnames, filenames in os.walk(root_dir):
            # Calculate the relative path from the root directory
            rel_path = os.path.relpath(dirpath, root_dir)
            if rel_path == '.':
                # This is the root directory
                f.write(f"{os.path.basename(root_dir)}\n")
            else:
                # Write the directory path with indentation to show hierarchy
                indent = '  ' * (rel_path.count(os.sep))
                f.write(f"{indent}{os.path.basename(dirpath)}\n")
            # Write the files in the current directory
            for filename in filenames:
                indent = '  ' * (rel_path.count(os.sep) + 1)
                f.write(f"{indent}{filename}\n")

# Example usage

root_directory = os.path.abspath(r"C:\Users\soren\OneDrive\Documents\GitHub\GuidedCreativePlanning\backend")  # Ensure it's an absolute path
output_text_file = "project_structure.txt"
create_folder_structure_text(root_directory, output_text_file)