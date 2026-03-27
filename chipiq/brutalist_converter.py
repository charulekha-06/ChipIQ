import os
import re

def brutalist_theme(directory):
    color_map = {
        # Eliminate off-whites
        '#F0F0F0': '#FFFFFF',
        '#f0f0f0': '#FFFFFF',
        '#E0E0E0': '#000000', # Borders to solid black
        '#e0e0e0': '#000000',
        '#CCCCCC': '#000000', 
        '#cccccc': '#000000',
        
        # Eliminate gray text
        '#666666': '#000000',
        '#333333': '#000000',
        '#444444': '#000000',
        'var(--text-dim)': '#000000',
        'var(--text-muted)': '#000000',
        
        # Translucent backgrounds to solid
        'rgba(0, 0, 0, 0.05)': 'transparent',
        'rgba(0, 0, 0, 0.08)': 'transparent',
        'rgba(0, 0, 0, 0.1)': 'transparent',
        'rgba(0, 0, 0, 0.2)': 'transparent',
        'rgba(0, 0, 0, 0.3)': 'transparent',
        'rgba(0, 0, 0, 0.5)': 'transparent',
        
        # Dashboard Recharts default lines
        '#475569': '#000000',
        '#1e293b': '#FFFFFF',
        'rgba(255,255,255,0.04)': 'rgba(0,0,0,1)', # Recharts grid lines
        'rgba(255,255,255,0.03)': 'rgba(0,0,0,1)',
    }

    # Normalize map keys to lower case for hex
    hex_map = {k.lower(): v for k, v in color_map.items() if k.startswith('#')}
    other_map = {k: v for k, v in color_map.items() if not k.startswith('#')}

    def hex_replace(match):
        hex_val = match.group(0).lower()
        return hex_map.get(hex_val, match.group(0))

    hex_pattern = re.compile('|'.join(re.escape(k) for k in hex_map.keys()), re.IGNORECASE)

    for root, dirs, files in os.walk(directory):
        for file in files:
            if file.endswith('.css') or file.endswith('.jsx'):
                filepath = os.path.join(root, file)
                
                with open(filepath, 'r', encoding='utf-8') as f:
                    content = f.read()
                
                original_content = content
                
                if hex_map:
                    content = hex_pattern.sub(hex_replace, content)
                
                for k, v in other_map.items():
                    content = content.replace(k, v)
                
                if content != original_content:
                    with open(filepath, 'w', encoding='utf-8') as f:
                        f.write(content)
                    print(f"Brutalist Updated: {filepath}")

if __name__ == "__main__":
    brutalist_theme('/Users/charulekha/Desktop/projects/chipiq/src')
