"""
Data source connectors for ChipIQ
Integrates with Jira, Git, coverage tools, log parsers, etc.
"""

from typing import Any, Dict, List, Optional, Tuple
from datetime import datetime
from pathlib import Path
import json
import csv
import re
import xml.etree.ElementTree as ET
import subprocess
import pandas as pd
from abc import ABC, abstractmethod


class DataConnector(ABC):
    """Base class for data source connectors"""
    
    @abstractmethod
    def connect(self, **kwargs) -> bool:
        """Connect to data source. Return True if successful."""
        pass
    
    @abstractmethod
    def fetch_data(self) -> Dict[str, Any]:
        """Fetch data and return {success, table_name, data, schema, message}"""
        pass
    
    @abstractmethod
    def get_config_template(self) -> Dict[str, Dict]:
        """Return required config fields with descriptions"""
        pass


class GitConnector(DataConnector):
    """Extract RTL commits from Git repository"""
    
    def __init__(self):
        self.repo_path = None
        self.connected = False
    
    def connect(self, repo_path: str) -> bool:
        """Connect to a Git repository"""
        try:
            repo_path = Path(repo_path)
            if not (repo_path / '.git').exists():
                return False
            self.repo_path = repo_path
            self.connected = True
            return True
        except:
            return False
    
    def fetch_data(self) -> Dict[str, Any]:
        """Fetch commit history"""
        if not self.connected:
            return {'success': False, 'message': 'Not connected to repository'}
        
        try:
            # Get git log with statistics
            cmd = [
                'git', '-C', str(self.repo_path), 'log',
                '--numstat', '--pretty=format:%H|%an|%ae|%ai|%s',
                '--since=1 year ago'
            ]
            
            result = subprocess.run(cmd, capture_output=True, text=True, timeout=10)
            if result.returncode != 0:
                return {'success': False, 'message': f'Git error: {result.stderr}'}
            
            commits = []
            current_commit = None
            
            for line in result.stdout.split('\n'):
                if '|' in line and not line.startswith('\t'):
                    # Commit line
                    parts = line.split('|')
                    current_commit = {
                        'hash': parts[0][:7],
                        'author': parts[1],
                        'email': parts[2],
                        'date': parts[3][:10],  # YYYY-MM-DD
                        'message': parts[4],
                        'files_changed': 0,
                        'insertions': 0,
                        'deletions': 0
                    }
                    commits.append(current_commit)
                elif line.startswith('\t') and current_commit:
                    # File change line: insertions deletions filepath
                    parts = line.strip().split('\t')
                    if len(parts) >= 2:
                        try:
                            current_commit['insertions'] += int(parts[0]) if parts[0].isdigit() else 0
                            current_commit['deletions'] += int(parts[1]) if parts[1].isdigit() else 0
                            current_commit['files_changed'] += 1
                        except:
                            pass
            
            if not commits:
                return {'success': False, 'message': 'No commits found'}
            
            return {
                'success': True,
                'table_name': 'rtl_commits',
                'data': commits,
                'message': f'Loaded {len(commits)} commits from git history'
            }
        except Exception as e:
            return {'success': False, 'message': f'Error fetching git data: {str(e)}'}
    
    def get_config_template(self) -> Dict[str, Dict]:
        return {
            'repo_path': {
                'type': 'string',
                'description': 'Path to git repository root',
                'example': '/home/user/chipiq-rtl'
            }
        }


class JiraConnector(DataConnector):
    """Fetch bug reports from Jira"""
    
    def __init__(self):
        self.base_url = None
        self.username = None
        self.api_token = None
        self.project_key = None
        self.connected = False
    
    def connect(self, base_url: str, username: str, api_token: str, project_key: str) -> bool:
        """Connect to Jira instance"""
        try:
            import requests
            # Test connection with a simple GET
            auth = (username, api_token)
            resp = requests.get(f'{base_url}/rest/api/3/project/{project_key}', auth=auth, timeout=5)
            if resp.status_code == 200:
                self.base_url = base_url
                self.username = username
                self.api_token = api_token
                self.project_key = project_key
                self.connected = True
                return True
        except:
            pass
        return False
    
    def fetch_data(self) -> Dict[str, Any]:
        """Fetch bug reports from Jira"""
        if not self.connected:
            return {'success': False, 'message': 'Not connected to Jira'}
        
        try:
            import requests
            
            auth = (self.username, self.api_token)
            # JQL: Get all bugs and issues from project, recent first
            jql = f'project = {self.project_key} AND updated >= -30d ORDER BY updated DESC'
            url = f'{self.base_url}/rest/api/3/search'
            
            params = {
                'jql': jql,
                'maxResults': 100,
                'fields': 'key,summary,status,priority,created,updated,issueType,components'
            }
            
            resp = requests.get(url, params=params, auth=auth, timeout=10)
            if resp.status_code != 200:
                return {'success': False, 'message': f'Jira error: {resp.status_code}'}
            
            issues = []
            for issue in resp.json().get('issues', []):
                fields = issue['fields']
                issues.append({
                    'key': issue['key'],
                    'title': fields.get('summary', ''),
                    'type': fields.get('issueType', {}).get('name', ''),
                    'status': fields.get('status', {}).get('name', ''),
                    'priority': fields.get('priority', {}).get('name', 'None'),
                    'component': fields.get('components', [{}])[0].get('name', 'General'),
                    'created': fields.get('created', '')[:10],
                    'updated': fields.get('updated', '')[:10],
                })
            
            if not issues:
                return {'success': False, 'message': 'No issues found'}
            
            return {
                'success': True,
                'table_name': 'bug_reports',
                'data': issues,
                'message': f'Loaded {len(issues)} issues from Jira'
            }
        except Exception as e:
            return {'success': False, 'message': f'Error fetching Jira data: {str(e)}'}
    
    def get_config_template(self) -> Dict[str, Dict]:
        return {
            'base_url': {
                'type': 'string',
                'description': 'Jira instance URL',
                'example': 'https://jira.company.com'
            },
            'username': {
                'type': 'string',
                'description': 'Jira username or email',
                'example': 'user@company.com'
            },
            'api_token': {
                'type': 'password',
                'description': 'Jira API token',
            },
            'project_key': {
                'type': 'string',
                'description': 'Project key (e.g., SOC, CHIPIQ)',
                'example': 'SOC'
            }
        }


class CoverageConnector(DataConnector):
    """Parse code coverage reports (COBERTURA XML format)"""
    
    def __init__(self):
        self.file_path = None
        self.connected = False
    
    def connect(self, file_path: str) -> bool:
        """Connect to coverage XML file"""
        try:
            file_path = Path(file_path)
            if not file_path.exists() or not file_path.suffix == '.xml':
                return False
            self.file_path = file_path
            self.connected = True
            return True
        except:
            return False
    
    def fetch_data(self) -> Dict[str, Any]:
        """Parse COBERTURA coverage XML"""
        if not self.connected:
            return {'success': False, 'message': 'File not connected'}
        
        try:
            tree = ET.parse(str(self.file_path))
            root = tree.getroot()
            
            coverage_data = []
            
            # Extract package/class coverage
            for package in root.findall('.//package'):
                package_name = package.get('name', 'unknown')
                for cls in package.findall('class'):
                    class_name = cls.get('name', '')
                    try:
                        line_rate = float(cls.get('line-rate', 0)) * 100
                        branch_rate = float(cls.get('branch-rate', 0)) * 100
                        coverage_data.append({
                            'package': package_name,
                            'class': class_name,
                            'line_coverage': round(line_rate, 1),
                            'branch_coverage': round(branch_rate, 1),
                            'average_coverage': round((line_rate + branch_rate) / 2, 1)
                        })
                    except:
                        pass
            
            if not coverage_data:
                return {'success': False, 'message': 'No coverage data found in XML'}
            
            return {
                'success': True,
                'table_name': 'coverage_data',
                'data': coverage_data,
                'message': f'Loaded coverage for {len(coverage_data)} classes'
            }
        except Exception as e:
            return {'success': False, 'message': f'Error parsing coverage XML: {str(e)}'}
    
    def get_config_template(self) -> Dict[str, Dict]:
        return {
            'file_path': {
                'type': 'file',
                'description': 'Path to COBERTURA coverage.xml file',
                'example': '/path/to/coverage.xml'
            }
        }


class LogAnalyzerConnector(DataConnector):
    """Parse simulation or test logs"""
    
    def __init__(self):
        self.file_path = None
        self.connected = False
        self.patterns = {
            'error': r'ERROR|ERROR:|failed|FAIL',
            'warning': r'WARNING|WARN:|deprecated',
            'test': r'TEST|TESTCASE|@test',
            'timestamp': r'\d{4}-\d{2}-\d{2}|\d{2}:\d{2}:\d{2}',
        }
    
    def connect(self, file_path: str) -> bool:
        """Connect to log file"""
        try:
            file_path = Path(file_path)
            if not file_path.exists():
                return False
            self.file_path = file_path
            self.connected = True
            return True
        except:
            return False
    
    def fetch_data(self) -> Dict[str, Any]:
        """Parse log file for errors, warnings, tests"""
        if not self.connected:
            return {'success': False, 'message': 'File not connected'}
        
        try:
            with open(str(self.file_path), 'r', errors='ignore') as f:
                lines = f.readlines()
            
            events = []
            for i, line in enumerate(lines[-1000:], start=max(0, len(lines)-1000)):  # Last 1000 lines
                line_clean = line.strip()
                if not line_clean:
                    continue
                
                severity = 'info'
                if re.search(self.patterns['error'], line_clean, re.IGNORECASE):
                    severity = 'error'
                elif re.search(self.patterns['warning'], line_clean, re.IGNORECASE):
                    severity = 'warning'
                
                # Try to extract timestamp
                timestamp = 'unknown'
                ts_match = re.search(self.patterns['timestamp'], line_clean)
                if ts_match:
                    timestamp = ts_match.group(0)
                
                events.append({
                    'timestamp': timestamp,
                    'severity': severity,
                    'message': line_clean[:200],  # First 200 chars
                    'line_number': i + 1
                })
            
            if not events:
                return {'success': False, 'message': 'No structured data in log'}
            
            return {
                'success': True,
                'table_name': 'simulation_logs',
                'data': events,
                'message': f'Extracted {len(events)} events from log ({len([e for e in events if e["severity"]=="error"])} errors)'
            }
        except Exception as e:
            return {'success': False, 'message': f'Error parsing log: {str(e)}'}
    
    def get_config_template(self) -> Dict[str, Dict]:
        return {
            'file_path': {
                'type': 'file',
                'description': 'Path to simulation/test log file',
                'example': '/path/to/simulation.log'
            }
        }


class RegressionResultsConnector(DataConnector):
    """Parse regression test results (JUnit XML or JSON)"""
    
    def __init__(self):
        self.file_path = None
        self.connected = False
    
    def connect(self, file_path: str) -> bool:
        """Connect to regression results file"""
        try:
            file_path = Path(file_path)
            if not file_path.exists():
                return False
            self.file_path = file_path
            self.connected = True
            return True
        except:
            return False
    
    def fetch_data(self) -> Dict[str, Any]:
        """Parse JUnit XML or JSON test results"""
        if not self.connected:
            return {'success': False, 'message': 'File not connected'}
        
        try:
            if self.file_path.suffix == '.xml':
                return self._parse_junit_xml()
            elif self.file_path.suffix == '.json':
                return self._parse_json()
            else:
                return {'success': False, 'message': 'Unsupported format (use .xml or .json)'}
        except Exception as e:
            return {'success': False, 'message': f'Error parsing results: {str(e)}'}
    
    def _parse_junit_xml(self) -> Dict[str, Any]:
        """Parse JUnit XML test results"""
        tree = ET.parse(str(self.file_path))
        root = tree.getroot()
        
        tests = []
        for testsuite in root.findall('.//testsuite'):
            suite_name = testsuite.get('name', 'unknown')
            for testcase in testsuite.findall('testcase'):
                status = 'passed'
                duration = float(testcase.get('time', 0))
                
                if testcase.find('failure') is not None:
                    status = 'failed'
                elif testcase.find('skipped') is not None:
                    status = 'skipped'
                
                tests.append({
                    'suite': suite_name,
                    'test_name': testcase.get('name', ''),
                    'class': testcase.get('classname', ''),
                    'status': status,
                    'duration_sec': round(duration, 3),
                })
        
        if not tests:
            return {'success': False, 'message': 'No tests found in XML'}
        
        return {
            'success': True,
            'table_name': 'regression_results',
            'data': tests,
            'message': f'Loaded {len(tests)} test results'
        }
    
    def _parse_json(self) -> Dict[str, Any]:
        """Parse JSON test results"""
        with open(str(self.file_path), 'r') as f:
            data = json.load(f)
        
        # Handle different JSON structures
        if isinstance(data, list):
            tests = data
        elif 'tests' in data:
            tests = data['tests']
        elif 'results' in data:
            tests = data['results']
        else:
            tests = []
        
        # Normalize field names
        normalized = []
        for test in tests:
            normalized.append({
                'suite': test.get('suite', test.get('class', 'default')),
                'test_name': test.get('name', test.get('test', '')),
                'class': test.get('class', ''),
                'status': test.get('status', test.get('result', 'unknown')).lower(),
                'duration_sec': float(test.get('time', test.get('duration', 0))),
            })
        
        if not normalized:
            return {'success': False, 'message': 'No test data in JSON'}
        
        return {
            'success': True,
            'table_name': 'regression_results',
            'data': normalized,
            'message': f'Loaded {len(normalized)} test results from JSON'
        }
    
    def get_config_template(self) -> Dict[str, Dict]:
        return {
            'file_path': {
                'type': 'file',
                'description': 'JUnit XML or JSON test results file',
                'example': '/path/to/results.xml or /path/to/results.json'
            }
        }


class ConnectorFactory:
    """Factory for creating and managing data connectors"""
    
    CONNECTORS = {
        'git': GitConnector,
        'jira': JiraConnector,
        'coverage': CoverageConnector,
        'logs': LogAnalyzerConnector,
        'regression': RegressionResultsConnector,
    }
    
    @classmethod
    def create(cls, connector_type: str) -> Optional[DataConnector]:
        """Create a connector instance by type"""
        if connector_type.lower() in cls.CONNECTORS:
            return cls.CONNECTORS[connector_type.lower()]()
        return None
    
    @classmethod
    def list_connectors(cls) -> Dict[str, str]:
        """List available connectors"""
        return {
            'git': 'Extract RTL commits from Git repository',
            'jira': 'Fetch bug reports from Jira',
            'coverage': 'Parse code coverage (COBERTURA XML)',
            'logs': 'Analyze simulation or test logs',
            'regression': 'Parse regression test results (JUnit XML or JSON)',
        }
