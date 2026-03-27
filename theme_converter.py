import os
import re

def convert_theme(directory):
    color_map = {
        # Backgrounds: Dark to Light
        '#0d1117': '#FFFFFF',
        '#010409': '#F0F0F0',
        '#161b22': '#FFFFFF',
        
        # Borders: Dark to Light
        '#30363d': '#E0E0E0',
        '#484f58': '#CCCCCC',
        
        # Text: Light to Dark
        '#c9d1d9': '#111111',
        '#8b949e': '#666666',
        '#ffffff': '#000000',
        '#fff': '#000000',
        
        # Accents: Cyan to Red
        '#00e5ff': '#D32F2F',
        '#22d3ee': '#D32F2F',
        
        # Greens/Yellows/Oranges
        '#3fb950': '#111111',
        '#22c55e': '#111111',
        '#f59e0b': '#444444',
        '#ffbf00': '#444444',
        '#d29922': '#444444',
        
        # Keep Reds
        '#ff7b72': '#D32F2F',
        '#ef4444': '#D32F2F',
        
        # RGBA replacements
        'rgba(0, 229, 255,': 'rgba(211, 47, 47,',
        'rgba(13, 17, 23,': 'rgba(255, 255, 255,',
        'rgba(255, 255, 255, 0.': 'rgba(0, 0, 0, 0.',
        'rgba(255,255,255,0.': 'rgba(0,0,0,0.', 
    }

    # Normalize map keys to lower case for hex
    hex_map = {k.lower(): v for k, v in color_map.items() if k.startswith('#')}
    rgba_map = {k: v for k, v in color_map.items() if k.startswith('rgba')}

    def hex_replace(match):
        hex_val = match.group(0).lower()
        return hex_map.get(hex_val, match.group(0))

    # Build regex for hex
    hex_pattern = re.compile('|'.join(re.escape(k) for k in hex_map.keys()), re.IGNORECASE)

    for root, dirs, files in os.walk(directory):
        for file in files:
            if file.endswith('.css') or file.endswith('.jsx'):
                filepath = os.path.join(root, file)
                
                with open(filepath, 'r', encoding='utf-8') as f:
                    content = f.read()
                
                original_content = content
                
                # Single pass hex replace
                content = hex_pattern.sub(hex_replace, content)
                
                # Sequential rgba replace is fine since targets don't overlap dangerously
                for k, v in rgba_map.items():
                    content = content.replace(k, v)
                
                if content != original_content:
                    with open(filepath, 'w', encoding='utf-8') as f:
                        f.write(content)
                    print(f"Updated: {filepath}")

if __name__ == "__main__":
    convert_theme('/Users/charulekha/Desktop/projects/chipiq/src')
