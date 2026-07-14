import os
import json
import subprocess
import shlex
from typing import Dict, Any, List
from backend.app.config import settings

class MCPClientHub:
    """Manages connections to Model Context Protocol (MCP) servers and handles tool executions."""
    
    def __init__(self):
        self.workspace_dir = settings.WORKSPACE_DIR
        self.active_servers: Dict[str, subprocess.Popen] = {}
        
    def list_available_tools(self) -> List[Dict[str, Any]]:
        """Return all tools registered in the SLM connectivity hub."""
        return [
            {
                "name": "read_workspace_file",
                "description": "Read a file's content inside the workspace",
                "inputSchema": {
                    "type": "object",
                    "properties": {
                        "relative_path": {"type": "string", "description": "Path relative to the workspace root"}
                    },
                    "required": ["relative_path"]
                }
            },
            {
                "name": "write_workspace_file",
                "description": "Write or overwrite a file in the workspace",
                "inputSchema": {
                    "type": "object",
                    "properties": {
                        "relative_path": {"type": "string", "description": "Path relative to the workspace root"},
                        "content": {"type": "string", "description": "The exact content to write"}
                    },
                    "required": ["relative_path", "content"]
                }
            },
            {
                "name": "list_workspace_dir",
                "description": "List directory contents in the workspace",
                "inputSchema": {
                    "type": "object",
                    "properties": {
                        "relative_path": {"type": "string", "description": "Relative directory path (empty string for root)"}
                    }
                }
            },
            {
                "name": "execute_shell_command",
                "description": "Execute a terminal command (e.g. npm run, pytest, git command) safely",
                "inputSchema": {
                    "type": "object",
                    "properties": {
                        "command": {"type": "string", "description": "The full terminal command line"},
                        "timeout_sec": {"type": "integer", "description": "Max execution time in seconds", "default": 30}
                    },
                    "required": ["command"]
                }
            }
        ]

    def execute_tool(self, tool_name: str, arguments: Dict[str, Any]) -> Dict[str, Any]:
        """Execute one of the universal connectivity hub tools."""
        try:
            if tool_name == "read_workspace_file":
                return self._read_file(arguments.get("relative_path", ""))
            elif tool_name == "write_workspace_file":
                return self._write_file(arguments.get("relative_path", ""), arguments.get("content", ""))
            elif tool_name == "list_workspace_dir":
                return self._list_dir(arguments.get("relative_path", ""))
            elif tool_name == "execute_shell_command":
                return self._execute_command(arguments.get("command", ""), arguments.get("timeout_sec", 30))
            else:
                return {"isError": True, "content": [{"type": "text", "text": f"Tool '{tool_name}' not found."}]}
        except Exception as e:
            return {"isError": True, "content": [{"type": "text", "text": f"Execution failed: {str(e)}"}]}

    def _read_file(self, relative_path: str) -> Dict[str, Any]:
        full_path = os.path.join(self.workspace_dir, relative_path)
        # Security check: ensure path stays inside workspace (avoid directory traversal)
        if not os.path.abspath(full_path).startswith(os.path.abspath(self.workspace_dir)):
            return {"isError": True, "content": [{"type": "text", "text": "Access denied: outside workspace bounds."}]}
        
        if not os.path.exists(full_path):
            return {"isError": True, "content": [{"type": "text", "text": f"File '{relative_path}' does not exist."}]}
            
        with open(full_path, "r", encoding="utf-8", errors="ignore") as f:
            content = f.read()
            
        return {"isError": False, "content": [{"type": "text", "text": content}]}

    def _write_file(self, relative_path: str, content: str) -> Dict[str, Any]:
        full_path = os.path.join(self.workspace_dir, relative_path)
        if not os.path.abspath(full_path).startswith(os.path.abspath(self.workspace_dir)):
            return {"isError": True, "content": [{"type": "text", "text": "Access denied: outside workspace bounds."}]}
            
        # Create directories if missing
        os.makedirs(os.path.dirname(full_path), exist_ok=True)
        
        with open(full_path, "w", encoding="utf-8") as f:
            f.write(content)
            
        return {"isError": False, "content": [{"type": "text", "text": f"Successfully wrote {len(content)} bytes to {relative_path}"}]}

    def _list_dir(self, relative_path: str) -> Dict[str, Any]:
        full_path = os.path.join(self.workspace_dir, relative_path)
        if not os.path.abspath(full_path).startswith(os.path.abspath(self.workspace_dir)):
            return {"isError": True, "content": [{"type": "text", "text": "Access denied: outside workspace bounds."}]}
            
        if not os.path.exists(full_path):
            return {"isError": True, "content": [{"type": "text", "text": f"Directory '{relative_path}' does not exist."}]}
            
        items = []
        for item in os.listdir(full_path):
            ipath = os.path.join(full_path, item)
            items.append({
                "name": item,
                "type": "directory" if os.path.isdir(ipath) else "file",
                "size": os.path.getsize(ipath) if not os.path.isdir(ipath) else 0
            })
            
        return {"isError": False, "content": [{"type": "text", "text": json.dumps(items, indent=2)}]}

    def _execute_command(self, command: str, timeout_sec: int = 30) -> Dict[str, Any]:
        # Block malicious commands
        blocked_commands = {"rm -rf /", "del /f", "format ", "mkfs", "shutdown"}
        if any(b in command.lower() for b in blocked_commands):
            return {"isError": True, "content": [{"type": "text", "text": "Command blocked by security guardrails."}]}
            
        try:
            # Run command inside workspace dir
            result = subprocess.run(
                command,
                shell=True,
                cwd=self.workspace_dir,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True,
                timeout=timeout_sec
            )
            
            output = f"STDOUT:\n{result.stdout}\n\nSTDERR:\n{result.stderr}"
            is_error = result.returncode != 0
            
            return {
                "isError": is_error,
                "content": [{"type": "text", "text": output}],
                "exit_code": result.returncode
            }
        except subprocess.TimeoutExpired:
            return {"isError": True, "content": [{"type": "text", "text": f"Command timed out after {timeout_sec} seconds."}]}
        except Exception as e:
            return {"isError": True, "content": [{"type": "text", "text": f"Execution error: {str(e)}"}]}

mcp_hub = MCPClientHub()
