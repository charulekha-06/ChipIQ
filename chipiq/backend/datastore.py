"""
Dynamic data store for ChipIQ
Handles file uploads, schema detection, and flexible data storage
"""

import json
from typing import Any, Dict, List, Optional, Tuple
from io import BytesIO
import pandas as pd
import numpy as np
from datetime import datetime
from pathlib import Path
from pathlib import Path


class SchemaDetector:
    """Auto-detect column types and meanings from data"""
    
    DATE_PATTERNS = ['date', 'month', 'time', 'timestamp', 'created', 'updated', 'day']
    VALUE_PATTERNS = ['count', 'value', 'number', 'amount', 'total', 'bugs', 'issues']
    MODULE_PATTERNS = ['module', 'component', 'subsystem', 'block', 'system']
    SEVERITY_PATTERNS = ['severity', 'level', 'priority', 'status', 'criticality']
    
    @classmethod
    def detect_column_type(cls, col_name: str, sample_values: List) -> str:
        """Detect if column is: date, numeric, categorical, or text"""
        col_lower = col_name.lower()
        
        # Check column name hints
        for pattern in cls.DATE_PATTERNS:
            if pattern in col_lower:
                return 'date'
        
        # Check values
        numeric_count = 0
        for val in sample_values[:10]:
            try:
                float(val)
                numeric_count += 1
            except (TypeError, ValueError):
                pass
        
        if numeric_count / max(1, len(sample_values)) > 0.7:
            return 'numeric'
        
        # Check if categorical (low cardinality)
        unique = len(set(str(v) for v in sample_values))
        if unique < len(sample_values) * 0.3:
            return 'categorical'
        
        return 'text'
    
    @classmethod
    def detect_semantic_role(cls, col_name: str, col_type: str) -> Optional[str]:
        """Detect semantic meaning: bug_count, module, severity, date, etc"""
        col_lower = col_name.lower()
        
        # Date detection
        for pattern in cls.DATE_PATTERNS:
            if pattern in col_lower:
                return 'date'
        
        # Value detection
        for pattern in cls.VALUE_PATTERNS:
            if pattern in col_lower:
                return 'value'
        
        # Module detection
        for pattern in cls.MODULE_PATTERNS:
            if pattern in col_lower:
                return 'module'
        
        # Severity detection
        for pattern in cls.SEVERITY_PATTERNS:
            if pattern in col_lower:
                return 'severity'
        
        # Guess based on type
        if col_type == 'numeric':
            return 'value'
        elif col_type == 'categorical':
            return 'module'
        
        return None
    
    @classmethod
    def detect_schema(cls, df: pd.DataFrame) -> Dict[str, Dict]:
        """Return schema: {col_name: {type, role, sample}}"""
        schema = {}
        for col in df.columns:
            sample = df[col].dropna().head(5).tolist()
            col_type = cls.detect_column_type(col, sample)
            semantic_role = cls.detect_semantic_role(col, col_type)
            
            schema[col] = {
                'type': col_type,
                'detected_role': semantic_role,
                'sample': sample,
            }
        return schema


class DynamicDataStore:
    """In-memory data store with fallback to integrated files"""
    
    def __init__(self, integrated_data_dir: Path):
        self.integrated_dir = integrated_data_dir
        self.uploaded_data = {}  # {table_name: DataFrame}
        self.uploaded_schema = {}  # {table_name: schema}
        self.uploaded_files = {}  # {table_name: {filename, upload_time}}
        self.default_mappings = {}  # Allow user to map uploaded columns to standard names
    
    def upload_file(self, filename: str, file_bytes: bytes) -> Dict[str, Any]:
        """
        Parse uploaded CSV/JSON and store in memory
        Returns: {success, table_name, schema, preview, message}
        """
        try:
            # Determine file type and parse
            if filename.endswith('.csv'):
                df = pd.read_csv(BytesIO(file_bytes))
            elif filename.endswith('.json'):
                content = json.loads(BytesIO(file_bytes).read().decode('utf-8'))
                if isinstance(content, list):
                    df = pd.DataFrame(content)
                else:
                    # Maybe it's a dict with data key
                    df = pd.DataFrame(content.get('data', []))
            else:
                return {
                    'success': False,
                    'message': 'Unsupported file type. Use CSV or JSON.'
                }
            
            if df.empty:
                return {'success': False, 'message': 'File is empty'}
            
            # Clean column names
            df.columns = [str(c).strip().lower().replace(' ', '_') for c in df.columns]
            
            # Generate table name from filename
            table_name = filename.rsplit('.', 1)[0].lower()
            
            # Detect schema
            schema = SchemaDetector.detect_schema(df)
            
            # Store
            self.uploaded_data[table_name] = df
            self.uploaded_schema[table_name] = schema
            self.uploaded_files[table_name] = {
                'filename': filename,
                'rows': len(df),
                'columns': len(df.columns),
                'timestamp': datetime.now().isoformat()
            }
            
            # Preview
            preview = df.head(3).to_dict(orient='records')
            
            return {
                'success': True,
                'table_name': table_name,
                'schema': schema,
                'preview': preview,
                'file_info': self.uploaded_files[table_name],
                'message': f'Loaded {table_name}: {len(df)} rows, {len(df.columns)} columns'
            }
        
        except Exception as e:
            return {
                'success': False,
                'message': f'Error parsing file: {str(e)}'
            }
    
    def map_column(self, table_name: str, actual_col: str, standard_name: str):
        """Map user's column name to standard field (e.g., 'bug_count' → 'bugs')"""
        if table_name not in self.uploaded_data:
            raise ValueError(f'Table {table_name} not found')
        
        if table_name not in self.default_mappings:
            self.default_mappings[table_name] = {}
        
        self.default_mappings[table_name][actual_col] = standard_name
    
    def get_data_table(self, table_name: str) -> Optional[pd.DataFrame]:
        """Get uploaded table, with fallback to integrated files"""
        if table_name in self.uploaded_data:
            return self.uploaded_data[table_name].copy()
        
        # Try integrated files
        if table_name.endswith('_monthly') or 'trend' in table_name:
            file_path = self.integrated_dir / f'{table_name}.json'
        else:
            file_path = self.integrated_dir / f'{table_name}.json'
        
        if file_path.exists():
            try:
                data = json.loads(file_path.read_text())
                return pd.DataFrame(data if isinstance(data, list) else [data])
            except:
                return None
        
        return None
    
    def extract_numeric_series(self, table_name: str, 
                              date_col: Optional[str] = None,
                              value_col: Optional[str] = None) -> Tuple[List[str], np.ndarray]:
        """
        Extract date and numeric value columns for forecasting
        Auto-detects if columns not specified
        Returns: (date_labels, values_array)
        """
        df = self.get_data_table(table_name)
        if df is None:
            raise ValueError(f'Table {table_name} not found')
        
        # Auto-detect columns if not specified
        if date_col is None:
            # Find date column
            schema = self.uploaded_schema.get(table_name, {})
            for col, info in schema.items():
                if info.get('detected_role') == 'date':
                    date_col = col
                    break
            # Fallback to common patterns
            if date_col is None:
                for col in df.columns:
                    if any(p in col.lower() for p in ['date', 'month', 'time']):
                        date_col = col
                        break
            if date_col is None and 'month' in df.columns:
                date_col = 'month'
        
        if value_col is None:
            # Find numeric column
            schema = self.uploaded_schema.get(table_name, {})
            for col, info in schema.items():
                if info.get('detected_role') == 'value':
                    value_col = col
                    break
            # Fallback
            if value_col is None:
                for col in df.columns:
                    if any(p in col.lower() for p in ['bug', 'count', 'value', 'total']):
                        value_col = col
                        break
            if value_col is None:
                # Get first numeric column
                for col in df.columns:
                    if df[col].dtype in [np.float64, np.int64, np.float32, np.int32]:
                        value_col = col
                        break
        
        if date_col is None or value_col is None:
            raise ValueError(f'Could not auto-detect date/value columns in {table_name}')
        
        # Extract and clean
        dates = df[date_col].dropna().astype(str).tolist()
        values = pd.to_numeric(df[value_col], errors='coerce').dropna().values
        
        return dates, values
    
    def reset(self):
        """Clear all uploaded data"""
        self.uploaded_data.clear()
        self.uploaded_schema.clear()
        self.uploaded_files.clear()
        self.default_mappings.clear()
    
    def get_status(self) -> Dict[str, Any]:
        """Return current data store status"""
        return {
            'has_uploaded_data': len(self.uploaded_data) > 0,
            'uploaded_tables': list(self.uploaded_data.keys()),
            'file_info': self.uploaded_files,
            'schema': self.uploaded_schema,
        }
