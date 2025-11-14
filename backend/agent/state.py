"""
Agent State Management
Defines the state structure for the document validation agent
"""

from typing import TypedDict, List, Dict, Any, Optional
from dataclasses import dataclass


@dataclass
class TodoItem:
    """Represents a single todo item in the agent's plan"""
    id: str
    description: str
    status: str  # pending, in_progress, completed, failed
    result: Optional[str] = None
    error: Optional[str] = None


class AgentState(TypedDict):
    """
    State structure for the document validation agent
    
    Fields:
    - user_command: Original user instruction
    - document_content: Current document text content
    - todo_list: List of planned actions
    - current_todo_index: Index of currently executing todo
    - tool_descriptions: Available tools and their descriptions
    - execution_log: Log of all actions taken
    - final_result: Final execution result
    - error: Error message if any
    """
    user_command: str
    document_content: str
    todo_list: List[Dict[str, Any]]
    current_todo_index: int
    tool_descriptions: str
    execution_log: List[Dict[str, Any]]
    final_result: Optional[str]
    error: Optional[str]
    is_complete: bool

